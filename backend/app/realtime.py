"""Eventos e presença do processo gevent; nenhum dado de relato sai nas filas."""
from __future__ import annotations

import secrets
import time

from gevent.queue import Queue


class Assinatura:
    def __init__(self, central, caso_id):
        self.central = central
        self.caso_id = caso_id
        self.fila = Queue(maxsize=1)

    def fechar(self):
        self.central._assinaturas.discard(self)


class CentralEventos:
    def __init__(self, *, relogio=time.monotonic):
        self._relogio = relogio
        self._assinaturas = set()
        self._presencas = {}
        self._sessoes = {}

    @property
    def assinantes(self):
        return len(self._assinaturas)

    def assinar(self, caso_id=None):
        assinatura = Assinatura(self, caso_id)
        self._assinaturas.add(assinatura)
        return assinatura

    def publicar(self, caso_id):
        for assinatura in tuple(self._assinaturas):
            if assinatura.caso_id is None or (caso_id is not None and assinatura.caso_id == caso_id):
                if assinatura.fila.empty():
                    assinatura.fila.put_nowait('atualizar')

    def iniciar_sessao(self, expira):
        agora = time.time()
        self._sessoes = {sid: prazo for sid, prazo in self._sessoes.items() if prazo >= agora}
        sid = secrets.token_hex(24)
        self._sessoes[sid] = expira
        return sid

    def sessao_ativa(self, sid):
        return isinstance(sid, str) and self._sessoes.get(sid, 0) >= time.time()

    def revogar_sessao(self, sid):
        self._sessoes.pop(sid, None)
        self.publicar(None)

    def _expirar_presenca(self):
        limite = self._relogio() - 45
        self._presencas = {chave: valor for chave, valor in self._presencas.items() if valor[0] > limite}

    def presenca(self, caso_id):
        self._expirar_presenca()
        pessoas = {}
        prioridades = {'vendo': 0, 'mensagem': 1, 'nota': 2}
        for (caso, usuario, _aba), (_tempo, nome, atividade) in self._presencas.items():
            if caso == caso_id and (usuario not in pessoas or prioridades[atividade] > prioridades[pessoas[usuario]['atividade']]):
                pessoas[usuario] = {'id': usuario, 'nome': nome, 'atividade': atividade}
        return sorted(pessoas.values(), key=lambda p: p['id'])

    def pulsar(self, caso_id, usuario, aba, atividade):
        antes = self.presenca(caso_id)
        self._presencas[(caso_id, usuario['id'], aba)] = (self._relogio(), usuario['nome'], atividade)
        if self.presenca(caso_id) != antes:
            self.publicar(None)

    def remover_presenca(self, caso_id, usuario_id, aba):
        antes = self.presenca(caso_id)
        self._presencas.pop((caso_id, usuario_id, aba), None)
        if self.presenca(caso_id) != antes:
            self.publicar(None)


def publicar(caso_id=None):
    """As rotas chamam somente depois do commit da operação."""
    from flask import current_app
    current_app.extensions['eventos'].publicar(caso_id)
