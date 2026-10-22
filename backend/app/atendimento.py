"""Planejamento interno e motivos objetivos de atenção, sem projeção ao aluno."""
from datetime import date, datetime, timedelta, timezone
import re

from .casos import ID_MAX, _agora, _conferir_revisao, registrar_evento


def listar_atendimentos(conn, caso_id=None, hoje=None):
    hoje = hoje or datetime.now(timezone(timedelta(hours=-3))).date()
    rows = conn.execute('''
        SELECT c.id, c.status, c.ultimo_acesso_em, c.recorrencia_pendente,
               c.proxima_acao, c.prazo_acao, u.id AS responsavel_id,
               u.nome AS responsavel_nome, u.ativo AS responsavel_ativo,
               EXISTS(SELECT 1 FROM mensagens m WHERE m.caso_id=c.id
                      AND m.autor='coordenacao') AS respondido,
               (SELECT m.autor FROM mensagens m WHERE m.caso_id=c.id
                ORDER BY m.id DESC LIMIT 1) AS ultima_mensagem
        FROM casos c LEFT JOIN usuarios u ON u.id=c.responsavel_id
    ''' + (' WHERE c.id=?' if caso_id is not None else ''),
        (caso_id,) if caso_id is not None else ()).fetchall()
    result = {}
    for row in rows:
        responsavel = ({'id': row['responsavel_id'], 'nome': row['responsavel_nome'],
                        'ativo': bool(row['responsavel_ativo'])} if row['responsavel_id'] else None)
        reasons = []
        if row['status'] != 'resolvido':
            if not responsavel or not responsavel['ativo']:
                reasons.append('sem_responsavel')
            if not row['respondido']:
                reasons.append('sem_resposta')
        if row['ultima_mensagem'] == 'aluno':
            reasons.append('mensagem_pendente')
        if row['proxima_acao'] and row['prazo_acao'] and row['prazo_acao'] < hoje.isoformat():
            reasons.append('acao_vencida')
        if row['recorrencia_pendente']:
            reasons.append('recorrencia')
        result[row['id']] = dict(responsavel=responsavel, proxima_acao=row['proxima_acao'],
                                 prazo_acao=row['prazo_acao'], atencao=reasons,
                                 nao_aberto=row['ultimo_acesso_em'] is None)
    return result


def projetar_atendimento(conn, caso_id, hoje=None):
    return listar_atendimentos(conn, caso_id, hoje).get(caso_id)


def salvar(conn, caso_id, usuario_id, revisao, dados=None, concluir=False):
    conn.execute('BEGIN IMMEDIATE')
    try:
        row = conn.execute('SELECT * FROM casos WHERE id=?', (caso_id,)).fetchone()
        if row is None:
            conn.rollback()
            return False
        _conferir_revisao(row, revisao)
        if concluir:
            if not row['proxima_acao']:
                raise ValueError('nenhuma acao pendente para concluir')
            responsavel_id, acao, prazo = row['responsavel_id'], None, None
            detalhe = f"Ação concluída: {row['proxima_acao']} (prazo {row['prazo_acao']})"
        else:
            if set(dados) != {'responsavel_id', 'proxima_acao', 'prazo_acao', 'revisao_estado'}:
                raise ValueError('campos de atendimento invalidos')
            responsavel_id = dados.get('responsavel_id')
            if responsavel_id is not None:
                if type(responsavel_id) is not int or not 1 <= responsavel_id <= ID_MAX:
                    raise ValueError('responsavel invalido')
                user = conn.execute('SELECT nome FROM usuarios WHERE id=? AND ativo=1', (responsavel_id,)).fetchone()
                if not user:
                    raise ValueError('selecione um responsavel ativo')
            acao, prazo = dados.get('proxima_acao'), dados.get('prazo_acao')
            if not isinstance(acao, str) or len(acao.strip()) > 500:
                raise ValueError('acao deve ter ate 500 caracteres')
            acao = acao.strip() or None
            if prazo is not None:
                if not isinstance(prazo, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', prazo):
                    raise ValueError('prazo invalido')
                date.fromisoformat(prazo)
            if bool(acao) != bool(prazo):
                raise ValueError('preencha a acao e seu prazo juntos')
            if (responsavel_id, acao, prazo) == (row['responsavel_id'], row['proxima_acao'], row['prazo_acao']):
                conn.rollback()
                return True
            anterior = conn.execute('SELECT nome FROM usuarios WHERE id=?', (row['responsavel_id'],)).fetchone()
            detalhe = (f"Responsável: {anterior['nome'] if anterior else 'sem responsável'} → "
                       f"{user['nome'] if responsavel_id else 'sem responsável'}. "
                       f"Ação anterior: {row['proxima_acao'] or 'nenhuma'}; prazo: {row['prazo_acao'] or 'nenhum'}. "
                       f"Próxima ação: {acao or 'nenhuma'}; prazo: {prazo or 'nenhum'}.")
        conn.execute('''UPDATE casos SET responsavel_id=?, proxima_acao=?, prazo_acao=?,
                        revisao_estado=revisao_estado+1, atualizado_em=? WHERE id=?''',
                     (responsavel_id, acao, prazo, _agora(), caso_id))
        registrar_evento(conn, caso_id, 'acao_concluida' if concluir else 'atendimento', usuario_id, detalhe, commit=False)
        conn.commit()
        return True
    except BaseException:
        conn.rollback()
        raise
