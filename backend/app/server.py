"""Servidor de produção: os dois portais num só processo, com gevent.

Uso:
    python -m app.server [--data-dir PASTA]            sobe os dois portais
    python -m app.server [--data-dir PASTA] --criar-admin

Sem monkey patching do gevent: as requisições dos dois portais se revezam
num único hub, então o SQLite nunca vê duas escritas ao mesmo tempo vindas
deste processo. Só o backup (cópia de arquivos) roda no threadpool do hub.
"""
from __future__ import annotations

import argparse
import logging
import re
import signal
import sys
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import gevent
from gevent.pywsgi import WSGIServer

from . import create_coord_app, create_student_app
from .auth import criar_usuario, gerar_senha_inicial
from .backup import fazer_backup, limpar_antigos
from .config import Config, load_config
from .db import connect, init_db

ADMIN = "coordenacao"
INTERVALO_BACKUP = 24 * 60 * 60  # segundos
_ESPERA = 0.2  # intervalo de verificação do pedido de parada

log = logging.getLogger("seguranca.servidor")

# IPv4 (inclusive dentro de IPv6 mapeado) e qualquer token com dois ou mais
# ":" entre dígitos hexadecimais (IPv6, com zona opcional). Remover a mais é
# aceitável; deixar passar um endereço não é.
_IPV4 = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])")
_IPV6 = re.compile(r"(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f]{0,4}(?:%[\w.-]+)?")


def _sem_endereco(texto: str) -> str:
    return _IPV4.sub("[endereco]", _IPV6.sub("[endereco]", texto))


class _LogSemEndereco:
    """Arquivo falso para o `error_log` do gevent e o fluxo de exceções do hub.

    O gevent escreve nele o repr do socket (laddr/raddr) e o endereço do
    cliente em requisições malformadas; cada linha sai no logger com os
    endereços trocados por "[endereco]".
    """

    def __init__(self, logger: logging.Logger):
        self._logger = logger
        self._resto = ""

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
        if linha:
            self._logger.error("%s", linha)


# --- backup diário ---------------------------------------------------------

def _backup_e_limpeza(config: Config, agora: datetime) -> None:
    fazer_backup(config, agora)
    limpar_antigos(config, agora)


def _backup_uma_vez(config: Config) -> None:
    agora = datetime.now(timezone.utc)
    try:
        # cópia de arquivos bloqueia; no threadpool os portais seguem atendendo
        gevent.get_hub().threadpool.apply(_backup_e_limpeza, (config, agora))
    except Exception:
        log.exception("falha no backup diario")
    else:
        log.info("backup diario concluido")


def _rotina_backup(config: Config) -> None:
    """Um backup na partida e depois um a cada 24 horas."""
    while True:
        _backup_uma_vez(config)
        gevent.sleep(INTERVALO_BACKUP)


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
    # exceções não tratadas em greenlets incluem o repr do socket do cliente
    hub.exception_stream = log_erro

    servidores = [
        WSGIServer((config.host, config.student_port), create_student_app(config),
                   log=None, error_log=log_erro),
        WSGIServer((config.host, config.coord_port), create_coord_app(config),
                   log=None, error_log=log_erro),
    ]
    anteriores: dict = {}
    backup = None
    try:
        for s in servidores:
            s.start()
        if principal:
            anteriores = _instalar_sinais(parar)
        aluno, coord = (s.server_port for s in servidores)
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
        if not principal:
            # cada thread tem seu hub; sem isso o loop do libuv vaza
            hub.destroy(destroy_loop=True)


# --- linha de comando ----------------------------------------------------

def _criar_admin(config: Config) -> int:
    senha = gerar_senha_inicial()
    with closing(connect(config)) as conn:
        try:
            criar_usuario(conn, ADMIN, senha)
        except ValueError:
            print(f"Usuario '{ADMIN}' ja existe; a senha nao foi alterada.",
                  file=sys.stderr)
            return 2
    print(f"Usuario '{ADMIN}' criado.")
    print(f"Senha inicial: {senha}")
    print("Anote agora: ela nao sera exibida de novo.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="seguranca-integral",
        description="Servidor dos portais do aluno e da coordenacao.",
    )
    parser.add_argument("--data-dir", type=Path, default=None,
                        help="pasta de dados (padrao: C:\\ProgramData\\SegurancaIntegral)")
    parser.add_argument("--criar-admin", action="store_true",
                        help=f"cria o usuario '{ADMIN}' e mostra a senha inicial uma vez")
    args = parser.parse_args(argv)

    config = load_config(args.data_dir)
    init_db(config)
    if args.criar_admin:
        return _criar_admin(config)

    # não faz nada se o logging já foi configurado por quem chamou
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    servir(config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
