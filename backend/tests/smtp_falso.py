"""Servidor SMTP mínimo em 127.0.0.1 para os testes (sem rede real, sem TLS)."""
from __future__ import annotations

import socketserver
import threading


class _Manipulador(socketserver.StreamRequestHandler):
    def _r(self, texto: str) -> None:
        self.wfile.write((texto + "\r\n").encode())

    def handle(self) -> None:
        srv = self.server
        self._r("220 falso ESMTP")
        remetente, destinos = "", []
        while True:
            linha = self.rfile.readline()
            if not linha:
                return
            cmd = linha.decode("utf-8", "replace").strip()
            alto = cmd.upper()
            if alto.startswith(("EHLO", "HELO")):
                self._r("250 falso")
            elif alto.startswith("MAIL"):
                with srv.trava:
                    srv.conexoes += 1
                    recusar = srv.recusar_primeiras > 0
                    if recusar:
                        srv.recusar_primeiras -= 1
                if recusar:
                    self._r("451 tente depois")
                    continue
                remetente, destinos = cmd[10:], []
                self._r("250 ok")
            elif alto.startswith("RCPT"):
                destinos.append(cmd[8:].strip("<>"))
                self._r("250 ok")
            elif alto == "DATA":
                self._r("354 envie")
                corpo = []
                while True:
                    l = self.rfile.readline().decode("utf-8", "replace")
                    if l in (".\r\n", ".\n", ""):
                        break
                    corpo.append(l[1:] if l.startswith("..") else l)
                with srv.trava:
                    srv.mensagens.append({"de": remetente, "para": list(destinos),
                                          "bruto": "".join(corpo)})
                self._r("250 enfileirado")
            elif alto == "QUIT":
                self._r("221 tchau")
                return
            else:
                self._r("250 ok")


class SmtpFalso(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, recusar_primeiras: int = 0):
        super().__init__(("127.0.0.1", 0), _Manipulador)
        self.trava = threading.Lock()
        self.mensagens: list[dict] = []
        self.conexoes = 0
        self.recusar_primeiras = recusar_primeiras
        self._thread = threading.Thread(target=self.serve_forever, daemon=True)
        self._thread.start()

    @property
    def porta(self) -> int:
        return self.server_address[1]

    def parar(self) -> None:
        self.shutdown()
        self.server_close()
