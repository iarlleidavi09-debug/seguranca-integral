"""Relatório individual de apoio ao registro manual no ROE."""
from html import escape

from flask import Response

from .casos import detalhe_caso


CSS = """
body { font-family: system-ui, sans-serif; color: #182d2b; background: #fff;
       max-width: 52rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.6; }
h1 { line-height: 1.2; } h2 { margin-top: 2rem; }
dt { font-weight: bold; margin-top: 1rem; } dd { margin-left: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
p { overflow-wrap: anywhere; } .orientacao { padding: 1rem; background: #f3f5f1; }
@media print { .orientacao { display: none; } body { max-width: none; margin: 0; color: #000; } }
"""


def registrar(bp, obter_db, nao_encontrado):
    @bp.get('/api/exportacao.css')
    def estilo_exportacao():
        return Response(CSS, content_type='text/css; charset=utf-8')

    @bp.get('/api/casos/<int:caso_id>/exportacao')
    def exportar_caso(caso_id):
        caso = detalhe_caso(obter_db(), caso_id)
        if caso is None:
            return nao_encontrado()

        def campo(rotulo, valor):
            texto = str(valor) if valor is not None and str(valor).strip() else 'Não informado'
            return f'<dt>{escape(rotulo)}</dt><dd>{escape(texto)}</dd>'

        estados = {'novo': 'Recebido', 'em_investigacao': 'Em investigação', 'resolvido': 'Resolvido'}
        campos = [
            ('Número interno do caso', caso['id']),
            ('Canal', 'Acolhimento anônimo' if caso.get('canal') == 'acolhimento' else 'Relato'),
            ('Recebido em (UTC)', caso['criado_em']),
            ('Última atualização (UTC)', caso['atualizado_em']),
            ('Situação do atendimento', estados.get(caso['status'], caso['status'])),
            ('Nome de quem relatou', caso['nome']), ('Ano', caso.get('ano_relator')),
            ('Sala', caso.get('sala_relator')), ('Turma informada', caso['turma']),
            ('Quando ocorreu (conforme relato)', caso['quando']),
            ('Local informado', caso.get('local_nome') or caso.get('local_outro') or caso['onde']),
            ('Situações relatadas', '; '.join(caso.get('assuntos', [])) or None),
            ('Relato original', caso['relato']),
        ]
        secoes = '<h2>Dados do relato</h2><dl>' + ''.join(campo(*item) for item in campos) + '</dl>'
        secoes += '<h2>Providências e desfecho</h2>'
        if not caso['resolucoes']:
            secoes += '<p>Nenhuma resolução registrada.</p>'
        for resolucao in caso['resolucoes']:
            resolucao = {**resolucao, 'desfecho': {
                'solucionada': 'Situação solucionada',
                'intervencao_realizada': 'Intervenção realizada',
            }.get(resolucao['desfecho'], resolucao['desfecho'])}
            secoes += '<dl>' + ''.join(campo(rotulo, resolucao.get(chave)) for rotulo, chave in (
                ('Registrado em (UTC)', 'criado_em'), ('Providências', 'providencias'),
                ('Desfecho', 'desfecho'), ('Resultado', 'resultado'))) + '</dl>'
        secoes += '<h2>Conversa do atendimento</h2>'
        if not caso['mensagens']:
            secoes += '<p>Nenhuma mensagem registrada.</p>'
        for mensagem in caso['mensagens']:
            secoes += '<dl>' + campo('Autor', 'Aluno' if mensagem['autor'] == 'aluno' else 'Coordenação')
            if mensagem.get('apagada_em'):
                rotulo, texto = 'Mensagem', 'Mensagem apagada'
            else:
                rotulo = 'Mensagem (editada)' if mensagem.get('editada_em') else 'Mensagem'
                texto = mensagem['texto']
            secoes += campo('Enviada em (UTC)', mensagem['criado_em']) + campo(rotulo, texto) + '</dl>'
        html = ('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1">'
                f'<title>Caso {caso_id} — apoio ao ROE</title>'
                '<link rel="stylesheet" href="/api/exportacao.css"></head><body>'
                '<h1>Relatório para preenchimento do ROE</h1>'
                '<p class="orientacao">Relatório de apoio ao preenchimento manual do ROE. '
                'A compatibilidade com importação oficial ainda não foi validada. '
                'Selecione o texto para copiar ou use a opção Imprimir do navegador para salvar em PDF.</p>'
                + secoes + '</body></html>')
        return Response(html, content_type='text/html; charset=utf-8', headers={
            'Content-Disposition': f'inline; filename="caso-{caso_id}-apoio-roe.html"',
            'Cache-Control': 'no-store',
        })
