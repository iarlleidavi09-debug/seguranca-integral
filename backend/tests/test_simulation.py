"""Testes do modo de ensaio (casos fictícios marcados com simulacao=1)."""
from app.casos import adicionar_mensagem, adicionar_nota, criar_caso
from app.simulation import carregar_simulacao, remover_simulacao
from app.uploads import salvar_anexo

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _um(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()[0]


def test_simulacao_cria_casos_marcados(conn, config):
    criados = carregar_simulacao(conn, config)
    assert criados == 18
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE simulacao = 1") == 18
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE simulacao = 0") == 0
    # mistura de anônimos e identificados; anônimo nunca guarda nome nem turma
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE anonimo = 1") > 0
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE anonimo = 0") > 0
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE anonimo = 1 "
                     "AND (nome IS NOT NULL OR turma IS NOT NULL)") == 0
    assert _um(conn, "SELECT COUNT(*) FROM casos WHERE anonimo = 0 "
                     "AND nome NOT LIKE 'Aluno Exemplo %'") == 0
    # algumas mensagens de aluno e da coordenação, e nenhum anexo
    assert _um(conn, "SELECT COUNT(*) FROM mensagens WHERE autor = 'aluno'") > 0
    assert _um(conn, "SELECT COUNT(*) FROM mensagens WHERE autor = 'coordenacao'") > 0
    assert _um(conn, "SELECT COUNT(*) FROM anexos") == 0
    assert not config.uploads_dir.exists() or not list(config.uploads_dir.iterdir())


def test_simulacao_tem_as_tres_gravidades(conn, config):
    carregar_simulacao(conn, config)
    gravidades = {r[0] for r in conn.execute("SELECT gravidade FROM casos")}
    assert gravidades == {"alta", "media", "baixa"}


def test_simulacao_nao_duplica(conn, config):
    assert carregar_simulacao(conn, config) == 18
    assert carregar_simulacao(conn, config) == 0
    assert _um(conn, "SELECT COUNT(*) FROM casos") == 18


def test_simulacao_quantidade_menor(conn, config):
    assert carregar_simulacao(conn, config, quantidade=5) == 5


def test_remover_so_apaga_simulacao(conn, config):
    salvo = salvar_anexo(config, PNG)
    criar_caso(conn, config, {"tipo": "golpe", "relato": "Caso real de teste.",
                              "anonimo": True}, [salvo])
    real_id = _um(conn, "SELECT id FROM casos")
    adicionar_mensagem(conn, real_id, "aluno", "mensagem real")
    adicionar_nota(conn, real_id, None, "nota real")

    carregar_simulacao(conn, config)
    sim_id = _um(conn, "SELECT MIN(id) FROM casos WHERE simulacao = 1")
    adicionar_nota(conn, sim_id, None, "nota simulada")

    assert remover_simulacao(conn) == 18
    assert _um(conn, "SELECT COUNT(*) FROM casos") == 1
    assert _um(conn, "SELECT COUNT(*) FROM anexos WHERE caso_id = ?", (real_id,)) == 1
    assert _um(conn, "SELECT COUNT(*) FROM mensagens") == 1
    assert _um(conn, "SELECT COUNT(*) FROM notas_internas") == 1
    assert _um(conn, "SELECT COUNT(*) FROM eventos") == 1  # só o 'criado' do real
    assert (config.uploads_dir / salvo.nome_interno).exists()
    assert remover_simulacao(conn) == 0


def test_remover_apaga_arquivo_de_anexo_simulado(conn, config):
    carregar_simulacao(conn, config, quantidade=1)
    sim_id = _um(conn, "SELECT id FROM casos")
    salvo = salvar_anexo(config, PNG)
    conn.execute("INSERT INTO anexos (caso_id, nome_interno, tipo, tamanho) "
                 "VALUES (?,?,?,?)",
                 (sim_id, salvo.nome_interno, salvo.tipo, salvo.tamanho))
    conn.commit()
    assert remover_simulacao(conn, config) == 1
    assert not (config.uploads_dir / salvo.nome_interno).exists()


def test_rotas_de_simulacao_exigem_login(coord_client):
    r = coord_client.post("/api/simulacao/carregar", json={})
    assert r.status_code == 401
    r = coord_client.delete("/api/simulacao", json={})
    assert r.status_code == 401


def test_rotas_de_simulacao_exigem_json(coord_logado):
    assert coord_logado.post("/api/simulacao/carregar", data="x=1").status_code == 415
    assert coord_logado.delete("/api/simulacao", data="x=1").status_code == 415


def test_rotas_de_simulacao_carregam_e_removem(coord_logado):
    r = coord_logado.post("/api/simulacao/carregar", json={})
    assert r.status_code == 200 and r.get_json() == {"criados": 18}
    r2 = coord_logado.post("/api/simulacao/carregar", json={})
    assert r2.get_json() == {"criados": 0}
    casos = coord_logado.get("/api/casos").get_json()["casos"]
    assert len(casos) == 18 and all(c["simulacao"] for c in casos)
    r = coord_logado.delete("/api/simulacao", json={})
    assert r.status_code == 200 and r.get_json() == {"removidos": 18}
    assert coord_logado.get("/api/casos").get_json()["casos"] == []
