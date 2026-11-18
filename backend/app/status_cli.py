"""CLI somente leitura: consulta os dois portais diretamente pelo loopback."""
from __future__ import annotations

import http.client
import json as json_lib
import math
import socket
import time
from pathlib import Path

from .config import DATA_DIR_PADRAO, _ler_config_json
from .diagnostico import PRODUTO, VERSAO

TIMEOUT = 1.0
MAX_RESPOSTA = 16_384


class _SocketComPrazo(socket.socket):
    def __init__(self, prazo):
        super().__init__(socket.AF_INET, socket.SOCK_STREAM)
        self._prazo = prazo

    def _ajustar_timeout(self):
        restante = self._prazo - time.monotonic()
        if restante <= 0:
            raise TimeoutError('prazo da consulta encerrado')
        self.settimeout(restante)

    def connect(self, endereco):
        self._ajustar_timeout()
        return super().connect(endereco)

    def sendall(self, dados, *args):
        self._ajustar_timeout()
        return super().sendall(dados, *args)

    def recv_into(self, buffer, *args):
        # HTTPResponse usa makefile; SocketIO passa cada leitura por recv_into.
        # Reduzir o restante aqui também limita cabeçalhos/corpo em gotejamento.
        self._ajustar_timeout()
        return super().recv_into(buffer, *args)


class _ConexaoComPrazo(http.client.HTTPConnection):
    def __init__(self, porta):
        super().__init__('127.0.0.1', porta, timeout=TIMEOUT)
        self._prazo = time.monotonic() + TIMEOUT

    def connect(self):
        self.sock = _SocketComPrazo(self._prazo)
        self.sock.connect((self.host, self.port))


def _diagnostico_valido(dados, portal):
    if not isinstance(dados, dict) or set(dados) != {
            'produto', 'versao', 'portal', 'uptime_s', 'banco', 'backup', 'eventos'}:
        return False
    banco, backup, eventos = (dados.get(k) for k in ('banco', 'backup', 'eventos'))
    uptime = dados.get('uptime_s')
    if not (dados['produto'] == PRODUTO and dados['versao'] == VERSAO
            and dados['portal'] == portal and type(uptime) in (int, float)
            and 0 <= uptime <= 10**12 and math.isfinite(uptime)
            and isinstance(banco, dict) and set(banco) == {'ok'}
            and type(banco['ok']) is bool
            and isinstance(backup, dict) and set(backup) == {'estado', 'em'}
            and backup['estado'] in ('pendente', 'ok', 'erro')
            and (backup['em'] is None or isinstance(backup['em'], str))
            and isinstance(eventos, dict) and set(eventos) == {'assinantes'}
            and type(eventos['assinantes']) is int and eventos['assinantes'] >= 0):
        return False
    if backup['estado'] == 'pendente':
        return backup['em'] is None
    if backup['em'] is None:
        return False
    try:
        from datetime import datetime
        return datetime.fromisoformat(backup['em']).tzinfo is not None
    except ValueError:
        return False


def _consultar(porta, portal):
    resultado = {'portal': portal, 'porta': porta, 'estado': 'offline'}
    conn = _ConexaoComPrazo(porta)
    try:
        conn.request('GET', '/api/servidor')
        resposta = conn.getresponse()
        resultado['estado'] = 'servico_desconhecido'
        conteudo = resposta.read(MAX_RESPOSTA + 1)
        if resposta.status != 200 or len(conteudo) > MAX_RESPOSTA:
            return resultado
        try:
            dados = json_lib.loads(conteudo)
        except (ValueError, UnicodeError):
            return resultado
        if not _diagnostico_valido(dados, portal):
            return resultado
        resultado['diagnostico'] = dados
        resultado['estado'] = ('saudavel' if dados['banco']['ok']
                               and dados['backup']['estado'] != 'erro' else 'degradado')
    except http.client.BadStatusLine:
        resultado['estado'] = 'servico_desconhecido'
    except (OSError, http.client.HTTPException):
        if resultado['estado'] != 'offline':
            resultado['estado'] = 'servico_desconhecido'
    finally:
        conn.close()
    return resultado


def coletar_estado(data_dir: Path | None) -> dict:
    pasta = Path(data_dir) if data_dir is not None else DATA_DIR_PADRAO
    if not pasta.exists():
        return {'estado': 'offline', 'saida': 1, 'portais': [], 'enderecos': []}
    if not pasta.is_dir():
        return {'estado': 'configuracao_invalida', 'saida': 4, 'portais': [], 'enderecos': []}
    try:
        extras = _ler_config_json(pasta / 'config.json')
    except (OSError, ValueError):
        return {'estado': 'configuracao_invalida', 'saida': 4, 'portais': [], 'enderecos': []}
    aluno, coord = extras.get('student_port', 3000), extras.get('coord_port', 4000)
    hosts = extras.get('allowed_hosts', ())
    enderecos = []
    for host in hosts:
        if host not in ('localhost', '127.0.0.1', '0.0.0.0'):
            enderecos.append({'aluno': f'http://{host}:{aluno}',
                              'coordenacao': f'http://{host}:{coord}'})
    portais = [_consultar(aluno, 'aluno'), _consultar(coord, 'coordenacao')]
    estados = [p['estado'] for p in portais]
    estado = ('saudavel' if all(e == 'saudavel' for e in estados) else
              'offline' if all(e == 'offline' for e in estados) else 'degradado')
    return {'estado': estado, 'saida': 0 if estado == 'saudavel' else 1,
            'portais': portais, 'enderecos': enderecos}


def _mostrar(estado):
    print(f"TETRAGUARD {VERSAO}: {estado['estado']}", flush=True)
    for portal in estado['portais']:
        print(f"  {portal['portal']} (porta {portal['porta']}): {portal['estado']}")
        dados = portal.get('diagnostico')
        if dados:
            backup = dados['backup']
            print(f"    banco: {'ok' if dados['banco']['ok'] else 'indisponivel'}; "
                  f"uptime: {dados['uptime_s']}s; SSE: {dados['eventos']['assinantes']}")
            print(f"    backup: {backup['estado']}; em: {backup['em'] or '-'}")
    for enderecos in estado['enderecos']:
        print(f"  LAN aluno: {enderecos['aluno']}; coordenacao: {enderecos['coordenacao']}")


def main_status(data_dir=None, watch=False, json=False) -> int:
    if watch and json:
        return 2
    saida = 1
    try:
        while True:
            estado = coletar_estado(data_dir)
            saida = estado['saida']
            if json:
                print(json_lib.dumps(estado, ensure_ascii=True))
            else:
                _mostrar(estado)
            if not watch or saida == 4:
                return saida
            time.sleep(2)
    except KeyboardInterrupt:
        return saida
