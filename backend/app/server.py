"""Servidor de produção: os dois portais num só processo, com gevent.

Uso:
    python -m app.server [--data-dir PASTA]            sobe os dois portais
    python -m app.server [--data-dir PASTA] --criar-admin
    python -m app.server [--data-dir PASTA] --redefinir-senha

Saída: 0 ok; 2 erro de uso (argparse); 3 admin já existe; 4 pasta de dados
inutilizável, config.json inválido ou porta ocupada; 5 admin não existe
(--redefinir-senha).

Sem monkey patching do gevent: as requisições dos dois portais se revezam
num único hub, então o SQLite nunca vê duas escritas ao mesmo tempo vindas
deste processo. Só o backup (cópia de arquivos) roda no threadpool do hub.
"""
from __future__ import annotations

import argparse
import logging
import logging.handlers
import re
import signal
import sqlite3
import sys
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import gevent
from gevent.pywsgi import WSGIServer

from . import create_coord_app, create_student_app
from .auth import criar_usuario, gerar_senha_inicial, redefinir_senha
from .backup import fazer_backup, limpar_antigos, pasta_do_dia
from .config import Config, load_config, trocar_chave_de_sessao
from .db import connect, init_db

ADMIN = "coordenacao"
# códigos de saída; 2 fica para erro de uso do argparse
SAIDA_ADMIN_EXISTE = 3
SAIDA_ERRO_INICIO = 4
SAIDA_ADMIN_NAO_EXISTE = 5
INTERVALO_BACKUP = 24 * 60 * 60  # segundos
_ESPERA = 0.2  # intervalo de verificação do pedido de parada

log = logging.getLogger("seguranca.servidor")

# Remover a mais é aceitável; deixar passar um endereço não é. Sem lookbehind
# de palavra: "addr_203.0.113.45" também é coberto.
# IPv6 (2+ ":" entre hex) com cauda IPv4 opcional (mapeado, NAT64) e zona.
_IPV6 = re.compile(
    r"(?:[0-9A-Fa-f]{0,4}:){2,}(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f]{0,4})"
    r"(?:%[\w.-]+)?"
)
# Primeiro e último octeto aceitam qualquer quantidade de dígitos e os do meio
# aceitam preenchimento com zeros ("203.0.0113.45", "203.0.113.0045"): a
# forma não canônica também é endereço e nenhum dígito pode sobrar colado.
# Quatro octetos com um do meio de 4 dígitos sem zero à esquerda (como a
# versão "3.13.3824.5" de um caminho) não são tratados como endereço.
_OCTETO_MEIO = r"(?:0\d{1,3}|\d{1,3})"
_IPV4 = re.compile(rf"\d+(?:\.{_OCTETO_MEIO}){{2}}\.\d+")
# Rede de segurança: se depois da troca ainda sobrar algo com cara de
# endereço, a linha inteira é descartada. Os limites de dígito evitam
# descartar versões como "3.13.3824" em caminhos de traceback.
_RESIDUO = re.compile(
    r"(?<!\d)\d{1,3}\.\d{1,3}\.\d{1,3}(?!\d)"
    r"|\[endereco\]\d|\d\[endereco\]"
    r"|\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,}\b"
)
LINHA_DESCARTADA = "[linha de log com endereco descartada]"


def _sem_endereco(texto: str) -> str:
    """Troca endereços por "[endereco]"; descarta a linha se algo sobrar."""
    limpo = _IPV4.sub("[endereco]", _IPV6.sub("[endereco]", texto))
    if _RESIDUO.search(limpo):
        return LINHA_DESCARTADA
    return limpo


class _LogSemEndereco:
    """Arquivo falso para o `error_log` do gevent, o hub e o `sys.stderr`.

    O gevent escreve nele o repr do socket (laddr/raddr) e o endereço do
    cliente em requisições malformadas; cada linha sai no logger com os
    endereços trocados por "[endereco]".
    """

    encoding = "utf-8"

    def __init__(self, logger: logging.Logger):
        self._logger = logger
        self._resto = ""
        self._emitindo = False

    def isatty(self) -> bool:
        return False

    def write(self, texto) -> int:
        texto = str(texto)
        linhas = (self._resto + texto).split("\n")
        self._resto = linhas.pop()
        for linha in linhas:
            self._emitir(linha)
        return len(texto)

    def writelines(self, linhas) -> None:
        for linha in linhas:
            self.write(linha)

    def flush(self) -> None:
        if self._resto:
            resto, self._resto = self._resto, ""
            self._emitir(resto)

    def _emitir(self, linha: str) -> None:
        linha = _sem_endereco(linha.rstrip())
        if not linha:
            return
        if self._emitindo:
            # um handler de log que escreve no sys.stderr (que pode ser este
            # objeto) cairia em recursão; vai direto para o stderr original
            if sys.__stderr__ is not None:
                sys.__stderr__.write(linha + "\n")
            return
        self._emitindo = True
        try:
            self._logger.error("%s", linha)
        finally:
            self._emitindo = False


class _FormatoSemEndereco(logging.Formatter):
    """Formata o registro inteiro (com traceback) e filtra linha a linha."""

    def format(self, registro: logging.LogRecord) -> str:
        texto = super().format(registro)
        return "\n".join(_sem_endereco(linha) for linha in texto.split("\n"))


FORMATO_LOG = "%(asctime)s %(levelname)s %(name)s: %(message)s"
LOG_MAX_BYTES = 1_000_000
LOG_BACKUPS = 5


def _configurar_log(config: Config) -> list[logging.Handler]:
    """Log em data_dir/logs/servidor.log (rotativo) e, num terminal, na tela.

    A pasta fica dentro de data_dir e herda a mesma permissão (só SYSTEM e
    Administradores). Se o arquivo não puder ser aberto, o servidor sobe
    mesmo assim. Devolve os handlers postos no logger raiz, para tirar.
    """
    formato = _FormatoSemEndereco(FORMATO_LOG)
    handlers: list[logging.Handler] = []
    try:
        pasta = config.data_dir / "logs"
        pasta.mkdir(exist_ok=True)
        arquivo = logging.handlers.RotatingFileHandler(
            pasta / "servidor.log", maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUPS, encoding="utf-8")
    except OSError as erro:
        if sys.stderr is not None:
            print(f"Aviso: sem log em arquivo ({_sem_endereco(str(erro))})",
                  file=sys.stderr)
    else:
        arquivo.setFormatter(formato)
        handlers.append(arquivo)
    # na tarefa agendada não há terminal: a tela só serve rodando à mão
    if sys.stderr is not None and sys.stderr.isatty():
        console = logging.StreamHandler(sys.stderr)
        console.setFormatter(formato)
        handlers.append(console)
    raiz = logging.getLogger()
    raiz.setLevel(logging.INFO)
    for handler in handlers:
        raiz.addHandler(handler)
    return handlers


# --- backup diário ---------------------------------------------------------

def _backup_e_limpeza(config: Config, agora: datetime,
                      so_se_faltar: bool = False) -> None:
    # na partida não refaz o backup do dia: reinícios seguidos (a tarefa
    # relança a cada 5 minutos) não ficam copiando tudo de novo
    if not (so_se_faltar and pasta_do_dia(config, agora).exists()):
        fazer_backup(config, agora)
    limpar_antigos(config, agora)


def _backup_uma_vez(config: Config, so_se_faltar: bool = False) -> None:
    agora = datetime.now(timezone.utc)
    try:
        # cópia de arquivos bloqueia; no threadpool os portais seguem atendendo
        gevent.get_hub().threadpool.apply(_backup_e_limpeza,
                                          (config, agora, so_se_faltar))
    except Exception:
        log.exception("falha no backup diario")
    else:
        log.info("backup diario concluido")


def _rotina_backup(config: Config) -> None:
    """Backup na partida (se ainda não há o de hoje) e depois a cada 24 horas."""
    _backup_uma_vez(config, so_se_faltar=True)
    while True:
        gevent.sleep(INTERVALO_BACKUP)
        _backup_uma_vez(config)


# --- servidor ----------------------------------------------------------------

def _instalar_sinais(parar: threading.Event) -> dict:
    """SIGINT/SIGTERM (e SIGBREAK no Windows) pedem parada limpa."""
    def ao_sinal(_numero, _quadro):
        parar.set()

    anteriores = {}
    for nome in ("SIGINT", "SIGTERM", "SIGBREAK"):
        numero = getattr(signal, nome, None)
        if numero is None:
            continue
        try:
            anteriores[numero] = signal.signal(numero, ao_sinal)
        except (OSError, ValueError):
            pass
    return anteriores


def servir(config: Config, parar: threading.Event | None = None, *,
           ao_iniciar: Callable[[int, int], None] | None = None) -> None:
    """Sobe os dois portais em `config.host` e bloqueia até `parar` ser ligado.

    `ao_iniciar(porta_aluno, porta_coord)` recebe as portas de fato abertas
    (útil com porta 0 nos testes). Os sinais só são tratados quando chamado
    na thread principal, para os testes poderem rodar isto numa thread.
    """
    parar = parar if parar is not None else threading.Event()
    principal = threading.current_thread() is threading.main_thread()
    hub = gevent.get_hub()
    log_erro = _LogSemEndereco(log)
    # exception_stream é um readproperty: o valor atribuído fica no __dict__
    # da instância; guardar o estado permite devolver o padrão (sys.stderr)
    estado_hub = getattr(hub, "__dict__", {})
    tinha_stream = "exception_stream" in estado_hub
    stream_anterior = estado_hub.get("exception_stream")
    # exceções não tratadas em greenlets incluem o repr do socket do cliente
    hub.exception_stream = log_erro

    servidores: list[WSGIServer] = []
    anteriores: dict = {}
    backup = None
    try:
        servidores = [
            WSGIServer((config.host, config.student_port), create_student_app(config),
                       log=None, error_log=log_erro),
            WSGIServer((config.host, config.coord_port), create_coord_app(config),
                       log=None, error_log=log_erro),
        ]
        for s in servidores:
            s.start()
        if principal:
            anteriores = _instalar_sinais(parar)
        aluno, coord = (s.server_port for s in servidores)
        if not config.allowed_hosts:
            # sem endereços no log: só o aviso de que o Host não é validado
            log.warning("allowed_hosts vazio no config.json: o cabecalho Host "
                        "nao esta sendo validado; liste os dominios do tunel")
        # só as portas: o endereço de escuta não vai para o log
        log.info("portal do aluno na porta %d, coordenacao na porta %d", aluno, coord)
        if ao_iniciar is not None:
            ao_iniciar(aluno, coord)
        backup = gevent.spawn(_rotina_backup, config)
        # threading.Event.wait travaria o hub inteiro; por isso a espera curta
        while not parar.is_set():
            gevent.sleep(_ESPERA)
        log.info("encerrando")
    finally:
        for numero, anterior in anteriores.items():
            signal.signal(numero, anterior)
        if backup is not None:
            backup.kill(block=True, timeout=5)
        for s in servidores:
            s.stop(timeout=5)
        log_erro.flush()
        if tinha_stream:
            hub.exception_stream = stream_anterior
        else:
            estado_hub.pop("exception_stream", None)
        if not principal:
            # cada thread tem seu hub; sem isso o loop do libuv vaza
            hub.destroy(destroy_loop=True)


# --- linha de comando ----------------------------------------------------

def _criar_admin(config: Config) -> int:
    senha = gerar_senha_inicial()
    with closing(connect(config)) as conn:
        try:
            criar_usuario(conn, ADMIN, senha, "admin")
        except ValueError:
            print(f"Usuario '{ADMIN}' ja existe; a senha nao foi alterada.",
                  file=sys.stderr)
            return SAIDA_ADMIN_EXISTE
    print(f"Usuario '{ADMIN}' criado.")
    print(f"Senha inicial: {senha}")
    print("Anote agora: ela nao sera exibida de novo.")
    return 0


def _redefinir_senha(config: Config) -> int:
    senha = gerar_senha_inicial()
    with closing(connect(config)) as conn:
        if not redefinir_senha(conn, ADMIN, senha):
            print(f"Usuario '{ADMIN}' nao existe; use --criar-admin.", file=sys.stderr)
            return SAIDA_ADMIN_NAO_EXISTE
    # sessões abertas (inclusive de quem roubou a senha) morrem na próxima partida
    trocar_chave_de_sessao(config.data_dir)
    print(f"Senha do usuario '{ADMIN}' redefinida; conta desbloqueada e ativa.")
    print(f"Nova senha: {senha}")
    print("Anote agora: ela nao sera exibida de novo.")
    print("A chave de sessao (sessao.key) foi trocada: reinicie a tarefa para "
          "encerrar todas as sessoes abertas da coordenacao.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="seguranca-integral",
        description="Servidor dos portais do aluno e da coordenacao.",
    )
    parser.add_argument("--data-dir", type=Path, default=None,
                        help="pasta de dados (padrao: C:\\ProgramData\\SegurancaIntegral)")
    acao = parser.add_mutually_exclusive_group()
    acao.add_argument("--criar-admin", action="store_true",
                      help=f"cria o usuario '{ADMIN}' e mostra a senha inicial uma vez")
    acao.add_argument("--redefinir-senha", action="store_true",
                      help=f"gera nova senha para '{ADMIN}', desbloqueia e reativa a conta")
    args = parser.parse_args(argv)  # erro de uso: o argparse sai com 2

    try:
        config = load_config(args.data_dir)
        init_db(config)
    except (OSError, sqlite3.Error, ValueError) as erro:
        print(f"Nao foi possivel usar a pasta de dados: {_sem_endereco(str(erro))}",
              file=sys.stderr)
        return SAIDA_ERRO_INICIO
    if args.criar_admin:
        return _criar_admin(config)
    if args.redefinir_senha:
        return _redefinir_senha(config)

    # o handler de tela criado aqui guarda o stderr original, antes da troca
    handlers = _configurar_log(config)
    # o gevent ainda usa traceback.print_exc() direto no sys.stderr
    # (pywsgi, _handle_client_error); passa pelo mesmo filtro de endereços
    stderr_original = sys.stderr
    filtro_stderr = _LogSemEndereco(log)
    sys.stderr = filtro_stderr
    try:
        servir(config)
    except OSError as erro:
        # porta ocupada ou sem permissão: mensagem curta, sem traceback
        print(f"Nao foi possivel iniciar o servidor: {_sem_endereco(str(erro))}",
              file=stderr_original)
        return SAIDA_ERRO_INICIO
    finally:
        filtro_stderr.flush()
        sys.stderr = stderr_original
        raiz = logging.getLogger()
        for handler in handlers:
            raiz.removeHandler(handler)
            handler.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
