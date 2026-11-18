"""Rotas da trilha de evidências (coordenação). Nenhuma rota edita ou apaga acessos."""
from flask import Response, current_app, g, jsonify

from . import evidencias


def registrar(bp, obter_db, nao_encontrado):
    @bp.get('/api/casos/<int:caso_id>/integridade')
    def integridade_caso(caso_id):
        conn = obter_db()
        if conn.execute('SELECT 1 FROM casos WHERE id = ?', (caso_id,)).fetchone() is None:
            return nao_encontrado()
        itens = evidencias.conferir_anexos(conn, current_app.config['SI_CONFIG'], caso_id)
        resposta = jsonify({
            'anexos': [{k: i[k] for k in ('id', 'recebido_em', 'sha256', 'estado')} for i in itens],
            'pode_exportar': evidencias.pode_exportar(conn, caso_id, g.usuario)})
        resposta.headers['Cache-Control'] = 'no-store'
        return resposta

    @bp.get('/api/casos/<int:caso_id>/dossie')
    def dossie_caso(caso_id):
        conn = obter_db()
        if conn.execute('SELECT 1 FROM casos WHERE id = ?', (caso_id,)).fetchone() is None:
            return nao_encontrado()
        if not evidencias.pode_exportar(conn, caso_id, g.usuario):
            return jsonify({'erro': 'apenas administrador ou responsavel do caso'}), 403
        ids = [l['id'] for l in conn.execute(
            'SELECT id FROM anexos WHERE caso_id = ? ORDER BY id', (caso_id,))]
        for anexo_id in ids or [None]:
            evidencias.registrar_acesso(conn, caso_id, anexo_id, g.usuario['id'], 'exportar')
        pdf = evidencias.montar_dossie(conn, current_app.config['SI_CONFIG'], caso_id)
        return Response(pdf, mimetype='application/pdf', headers={
            'Content-Disposition': f'attachment; filename="dossie-caso-{caso_id}.pdf"',
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})
