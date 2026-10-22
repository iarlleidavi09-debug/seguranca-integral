"""Indicadores agregados; dias no horário de Brasília, sem conteúdo dos casos."""
from datetime import date, timedelta


def gerar_relatorio(conn, inicio: date, fim: date) -> dict:
    parametros = (inicio.isoformat(), fim.isoformat())
    recebidos = dict(conn.execute("""
        SELECT date(criado_em, '-3 hours'), count(*) FROM casos
        WHERE simulacao = 0 AND date(criado_em, '-3 hours') BETWEEN ? AND ?
        GROUP BY 1
    """, parametros).fetchall())
    resolvidos = dict(conn.execute("""
        SELECT date(r.primeira, '-3 hours'), count(*)
        FROM (SELECT caso_id, min(criado_em) AS primeira FROM resolucoes GROUP BY caso_id) r
        JOIN casos c ON c.id = r.caso_id
        WHERE c.simulacao = 0 AND date(r.primeira, '-3 hours') BETWEEN ? AND ?
        GROUP BY 1
    """, parametros).fetchall())
    por_prioridade = {(r[0], r[1]): r[2] for r in conn.execute("""
        SELECT date(criado_em, '-3 hours'), prioridade, count(*) FROM casos
        WHERE simulacao = 0 AND date(criado_em, '-3 hours') BETWEEN ? AND ?
        GROUP BY 1, 2
    """, parametros)}
    evolucao = []
    evolucao_prioridades = []
    dia = inicio
    while dia <= fim:
        chave = dia.isoformat()
        evolucao.append({'data': chave, 'recebidos': recebidos.get(chave, 0),
                         'resolvidos': resolvidos.get(chave, 0)})
        evolucao_prioridades.append({'data': chave, **{
            p: por_prioridade.get((chave, p), 0) for p in ('critica', 'alta', 'media', 'baixa')
        }})
        dia += timedelta(days=1)
    prioridades = [dict(r) for r in conn.execute("""
        SELECT prioridade, count(*) AS quantidade FROM casos
        WHERE simulacao = 0 AND date(criado_em, '-3 hours') BETWEEN ? AND ?
        GROUP BY prioridade ORDER BY quantidade DESC, prioridade
    """, parametros)]
    return {'inicio': inicio.isoformat(), 'fim': fim.isoformat(),
            'recebidos': sum(recebidos.values()), 'resolvidos': sum(resolvidos.values()),
            'evolucao': evolucao, 'prioridades': prioridades, 'evolucao_prioridades': evolucao_prioridades}
