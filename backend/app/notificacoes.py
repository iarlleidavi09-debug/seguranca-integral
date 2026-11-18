"""Alertas por canal (primeiro e-mail SMTP) para a coordenação.

Regras de segurança deste módulo:
- a mensagem é fixa e nunca leva código do caso, relato, local, nome nem a
  prioridade detalhada: só avisa que há algo para ver no painel;
- o envio roda numa thread de segundo plano, com fila e tentativas limitadas:
  falha ou lentidão do SMTP nunca atrasa nem derruba a criação do caso;
- credenciais do SMTP vêm do config.json ou do ambiente e nunca são logadas;
- sem configuração SMTP o recurso fica desligado, em silêncio;
- o registro de envios guarda só gatilho e resultado (sem texto, sem endereço).
"""
from __future__ import annotations

import logging
import queue
import smtplib
import ssl
import threading
from abc import ABC, abstractmethod
from contextlib import closing
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from .config import Config, email_valido
from .db import connect

log = logging.getLogger("tetraguard.alertas")

GATILHOS = ("critico", "recorrencia", "resumo")
# espera antes de cada tentativa, em segundos: o tamanho da tupla é o limite de tentativas
ESPERAS = (0, 3, 15)
# casos novos sem resposta da coordenação há mais que isto entram no resumo diário
PARADO_HORAS = 2
INTERVALO_TICK = 60.0
FILA_MAX = 100
TIMEOUT_SMTP = 15

# assunto e corpo por gatilho; texto fixo, sem dado de caso
MENSAGENS = {
    "critico": ("TETRAGUARD: novo caso crítico",
                "Novo caso crítico no TETRAGUARD. Abra o painel para ver."),
    "recorrencia": ("TETRAGUARD: caso aguarda revisão",
                    "Um caso aguarda revisão no TETRAGUARD. Abra o painel para ver."),
    "resumo": ("TETRAGUARD: resumo diário",
               "Há casos aguardando a primeira resposta no TETRAGUARD. Abra o painel para ver."),
}


def montar_mensagem(gatilho: str, link: str = "") -> tuple[str, str]:
    assunto, corpo = MENSAGENS[gatilho]
    if link:
        corpo = f"{corpo}\n{link}"
    return assunto, corpo


class Canal(ABC):
    """Um meio de entrega. Falha de envio sobe como exceção; quem chama decide."""

    nome = "canal"

    @abstractmethod
    def enviar(self, destino: str, assunto: str, corpo: str) -> None: ...


class CanalSMTP(Canal):
    nome = "email"

    def __init__(self, smtp: dict):
        self._smtp = smtp

    def enviar(self, destino: str, assunto: str, corpo: str) -> None:
        # a validação vem antes de montar a mensagem: sem quebra de linha no cabeçalho
        if not email_valido(destino):
            raise ValueError("endereco invalido")
        cfg = self._smtp
        msg = EmailMessage()
        msg["From"] = cfg["remetente"]
        msg["To"] = destino
        msg["Subject"] = assunto
        msg.set_content(corpo)
        if cfg["seguranca"] == "ssl":
            servidor = smtplib.SMTP_SSL(cfg["host"], cfg["porta"], timeout=TIMEOUT_SMTP,
                                        context=ssl.create_default_context())
        else:
            servidor = smtplib.SMTP(cfg["host"], cfg["porta"], timeout=TIMEOUT_SMTP)
        with servidor:
            if cfg["seguranca"] == "starttls":
                servidor.starttls(context=ssl.create_default_context())
            if cfg["usuario"] and cfg["senha"]:
                servidor.login(cfg["usuario"], cfg["senha"])
            servidor.send_message(msg)


def _agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Despachante:
    """Fila em segundo plano: um consumidor, tentativas limitadas, nunca levanta."""

    def __init__(self, config: Config, canal: Canal | None = None):
        self._config = config
        self._canal = canal or CanalSMTP(config.alertas["smtp"])
        self._fila: queue.Queue = queue.Queue(maxsize=FILA_MAX)
        self._thread: threading.Thread | None = None
        self._trava = threading.Lock()
        self._resumo_dia: str | None = None

    # -- entrada ----------------------------------------------------------

    def enfileirar(self, gatilho: str) -> None:
        """Chamada rápida e segura: no pior caso o alerta é descartado."""
        try:
            if gatilho not in GATILHOS:
                return
            self._iniciar()
            self._fila.put_nowait(gatilho)
        except Exception:  # noqa: BLE001 - alerta nunca pode quebrar o chamador
            log.warning("alerta descartado (fila indisponivel)")

    def esperar(self) -> None:
        """Bloqueia até a fila esvaziar (usado nos testes)."""
        self._fila.join()

    def parar(self) -> None:
        if self._thread is not None:
            self._fila.put(None)

    def _iniciar(self) -> None:
        with self._trava:
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._loop, name="alertas", daemon=True)
                self._thread.start()

    iniciar = _iniciar

    # -- consumidor -------------------------------------------------------

    def _loop(self) -> None:
        while True:
            try:
                gatilho = self._fila.get(timeout=INTERVALO_TICK)
            except queue.Empty:
                self._tick_seguro()
                continue
            try:
                if gatilho is None:
                    return
                self._processar(gatilho)
            except Exception as erro:  # noqa: BLE001
                log.warning("falha ao processar alerta (%s)", type(erro).__name__)
            finally:
                self._fila.task_done()

    def _tick_seguro(self) -> None:
        try:
            self.tick()
        except Exception as erro:  # noqa: BLE001
            log.warning("falha no resumo diario (%s)", type(erro).__name__)

    def _destinatarios(self, conn, gatilho: str) -> list[tuple[int, str]]:
        linhas = conn.execute(
            f"SELECT u.id, u.email FROM usuarios u JOIN preferencias_alerta p ON p.usuario_id = u.id "
            f"WHERE u.ativo = 1 AND p.{gatilho} = 1 AND u.email IS NOT NULL AND u.email <> ''"
        ).fetchall()
        return [(r["id"], r["email"]) for r in linhas if email_valido(r["email"])]

    def _processar(self, gatilho: str) -> None:
        link = self._config.alertas.get("link_painel", "")
        assunto, corpo = montar_mensagem(gatilho, link)
        with closing(connect(self._config)) as conn:
            destinatarios = self._destinatarios(conn, gatilho)
            for usuario_id, email in destinatarios:
                estado, tentativas = "falhou", 0
                for espera in ESPERAS:
                    if espera:
                        threading.Event().wait(espera)
                    tentativas += 1
                    try:
                        self._canal.enviar(email, assunto, corpo)
                        estado = "enviado"
                        break
                    except Exception as erro:  # noqa: BLE001 - só o tipo, sem detalhes
                        log.warning("falha no envio de alerta (%s)", type(erro).__name__)
                with conn:
                    conn.execute(
                        "INSERT INTO envios_alerta (usuario_id, gatilho, canal, estado, tentativas, criado_em) "
                        "VALUES (?,?,?,?,?,?)",
                        (usuario_id, gatilho, self._canal.nome, estado, tentativas, _agora_iso()),
                    )

    # -- resumo diário ----------------------------------------------------

    def tick(self, agora: datetime | None = None) -> bool:
        """Enfileira o resumo diário se já passou da hora e ainda não saiu hoje.

        `agora` é horário local do servidor. Devolve True se enfileirou.
        """
        hora = self._config.alertas.get("resumo_hora")
        if not hora:
            return False
        agora = agora or datetime.now()
        hh, mm = (int(p) for p in hora.split(":"))
        if agora < agora.replace(hour=hh, minute=mm, second=0, microsecond=0):
            return False
        dia = agora.date().isoformat()
        if self._resumo_dia == dia:
            return False
        inicio_dia = agora.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        limite = (datetime.now(timezone.utc) - timedelta(hours=PARADO_HORAS)).isoformat(timespec="seconds")
        with closing(connect(self._config)) as conn:
            ja_saiu = conn.execute(
                "SELECT 1 FROM envios_alerta WHERE gatilho = 'resumo' AND criado_em >= ? LIMIT 1",
                (inicio_dia.isoformat(timespec="seconds"),)).fetchone()
            if ja_saiu:
                self._resumo_dia = dia
                return False
            parados = conn.execute(
                "SELECT 1 FROM casos c WHERE c.status = 'novo' AND c.simulacao = 0 AND c.criado_em <= ? "
                "AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.caso_id = c.id AND m.autor = 'coordenacao') "
                "LIMIT 1", (limite,)).fetchone()
            if not parados or not self._destinatarios(conn, "resumo"):
                return False
        self._resumo_dia = dia
        self.enfileirar("resumo")
        return True


# -- registro por pasta de dados e pontos de entrada --------------------------

_REGISTRO: dict[str, Despachante] = {}
_TRAVA = threading.Lock()


def obter(config: Config) -> Despachante | None:
    """Despachante da instalação, ou None quando o SMTP não está configurado."""
    if not config.alertas:
        return None
    chave = str(config.data_dir)
    with _TRAVA:
        if chave not in _REGISTRO:
            _REGISTRO[chave] = Despachante(config)
        return _REGISTRO[chave]


def avisar(config: Config, gatilho: str) -> None:
    """Pede um alerta. Não bloqueia, não levanta e sem SMTP não faz nada."""
    try:
        despachante = obter(config)
        if despachante is not None:
            despachante.enfileirar(gatilho)
    except Exception:  # noqa: BLE001
        log.warning("alerta nao enfileirado")


def iniciar(config: Config) -> None:
    """Liga a thread (e o resumo diário) na partida do portal da coordenação."""
    despachante = obter(config)
    if despachante is not None and config.alertas.get("resumo_hora"):
        despachante.iniciar()


def reiniciar_registro() -> None:
    """Para e esquece os despachantes (testes)."""
    with _TRAVA:
        for d in _REGISTRO.values():
            d.parar()
        _REGISTRO.clear()


# -- preferências e endereços (camada de dados) --------------------------------

def ler_preferencias(conn, usuario_id: int) -> dict:
    linha = conn.execute(
        "SELECT critico, recorrencia, resumo FROM preferencias_alerta WHERE usuario_id = ?",
        (usuario_id,)).fetchone()
    base = {g: False for g in GATILHOS}
    if linha is not None:
        base = {g: bool(linha[g]) for g in GATILHOS}
    email = conn.execute("SELECT email FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    base["tem_email"] = bool(email and email["email"])
    return base


def salvar_preferencias(conn, usuario_id: int, valores: dict) -> None:
    conn.execute(
        "INSERT INTO preferencias_alerta (usuario_id, critico, recorrencia, resumo) VALUES (?,?,?,?) "
        "ON CONFLICT(usuario_id) DO UPDATE SET critico = excluded.critico, "
        "recorrencia = excluded.recorrencia, resumo = excluded.resumo",
        (usuario_id, *(int(bool(valores[g])) for g in GATILHOS)))
    conn.commit()


def definir_email(conn, usuario_id: int, email: str | None) -> bool:
    """Grava (ou limpa) o endereço. False se o usuário não existe."""
    if conn.execute("SELECT 1 FROM usuarios WHERE id = ?", (usuario_id,)).fetchone() is None:
        return False
    conn.execute("UPDATE usuarios SET email = ? WHERE id = ?", (email or None, usuario_id))
    conn.commit()
    return True


def listar_para_admin(conn) -> list[dict]:
    linhas = conn.execute(
        "SELECT u.id, u.nome, u.ativo, u.email, COALESCE(p.critico,0) AS critico, "
        "COALESCE(p.recorrencia,0) AS recorrencia, COALESCE(p.resumo,0) AS resumo "
        "FROM usuarios u LEFT JOIN preferencias_alerta p ON p.usuario_id = u.id "
        "ORDER BY u.nome COLLATE NOCASE, u.id").fetchall()
    return [{"id": r["id"], "nome": r["nome"], "ativo": bool(r["ativo"]), "email": r["email"] or "",
             **{g: bool(r[g]) for g in GATILHOS}} for r in linhas]
