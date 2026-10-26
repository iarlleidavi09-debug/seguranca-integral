"""Estado operacional do processo, disponível somente no loopback direto."""
from __future__ import annotations

import ipaddress
import sqlite3
import time
from contextlib import closing
from datetime import datetime

from flask import abort, jsonify, request

VERSAO = '3.1.0'
PRODUTO = 'seguranca-integral'


class EstadoRuntime:
    def __init__(self):
        self.inicio = time.monotonic()
        self.backup = {'estado': 'pendente', 'em': None}

    def registrar_backup(self, estado: str, em: datetime):
        self.backup = {'estado': estado, 'em': em.isoformat()}


def banco_disponivel(caminho) -> bool:
    try:
        with closing(sqlite3.connect(caminho.resolve().as_uri() + '?mode=ro',
                                    uri=True, timeout=0.5)) as conn:
            conn.execute('PRAGMA query_only=ON')
            conn.execute('SELECT id FROM casos LIMIT 0')
            conn.execute('SELECT id FROM usuarios LIMIT 0')
            return conn.execute('PRAGMA quick_check(1)').fetchone()[0] == 'ok'
    except (OSError, sqlite3.Error):
        return False


def registrar_diagnostico(app, portal, runtime):
    app.extensions['runtime'] = runtime

    @app.get('/api/servidor')
    def diagnostico():
        try:
            local = ipaddress.ip_address(request.remote_addr or '').is_loopback
        except ValueError:
            local = False
        proxy = any(nome.lower().startswith(('x-forwarded-', 'cf-')) or
                    nome.lower() in {'forwarded', 'x-real-ip', 'via',
                                     'true-client-ip', 'client-ip', 'x-proxyuser-ip'}
                    for nome in request.headers.keys())
        if not local or proxy:
            abort(403)
        return jsonify({
            'produto': PRODUTO, 'versao': VERSAO, 'portal': portal,
            'uptime_s': max(0, int(time.monotonic() - runtime.inicio)),
            'banco': {'ok': banco_disponivel(app.config['SI_CONFIG'].db_path)},
            'backup': dict(runtime.backup),
            'eventos': {'assinantes': app.extensions['eventos'].assinantes},
        })
