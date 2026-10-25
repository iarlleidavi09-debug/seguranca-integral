"""Limpeza dos dados da implantação secundária. Só usa pastas temporárias."""
import sqlite3
from pathlib import Path

import pytest

from app import implantacao
from app.auth import criar_usuario
from app.casos import adicionar_mensagem, criar_caso
from app.db import caminho_backup_v2, connect, init_db
from app.uploads import salvar_anexo

from imagens import png

PNG = png()
RELATO = "Um colega esta me xingando todos os dias no grupo da turma."
SENHA = "senha-forte-123"


def _caso(conn, config, relato=RELATO, anexos=0):
    salvos = [salvar_anexo(config, PNG) for _ in range(anexos)]
    criar_caso(conn, config, {"tipo": "cyberbullying", "relato": relato,
                              "anonimo": True}, salvos)
    return conn.execute("SELECT MAX(id) FROM casos").fetchone()[0]


def _foto_de_autor(conn, config, caso_id):
    """Resolução com um autor cuja foto fica em uploads/."""
    foto = salvar_anexo(config, PNG)
    resolucao = conn.execute(
        "INSERT INTO resolucoes (caso_id, desfecho, providencias, criado_em) "
        "VALUES (?, 'x', 'y', '2026-01-01T00:00:00+00:00')", (caso_id,)).lastrowid
    conn.execute(
        "INSERT INTO autores_resolucao (resolucao_id, nome, ano, sala, foto_nome, "
        "foto_tipo) VALUES (?, 'A', '1', 'B', ?, 'image/png')",
        (resolucao, foto.nome_interno))
    conn.commit()


def _popular(conn, config):
    """Dois casos com mensagem, nota, anexo e uma foto de autor."""
    ids = [_caso(conn, config, anexos=1), _caso(conn, config, anexos=1)]
    for i in ids:
        adicionar_mensagem(conn, i, "aluno", "oi")
        conn.execute("INSERT INTO notas_internas (caso_id, texto, criado_em) "
                     "VALUES (?, 'n', '2026-01-01')", (i,))
    _foto_de_autor(conn, config, ids[0])
    conn.commit()
    return ids


def _arquivos(config):
    return sorted(p.name for p in config.uploads_dir.iterdir())


def test_primeiro_admin_id_e_o_menor_id_de_admin(conn):
    criar_usuario(conn, "c1", SENHA, "coordenador")
    primeiro = criar_usuario(conn, "a1", SENHA, "admin")
    criar_usuario(conn, "a2", SENHA, "admin")
    conn.commit()
    assert implantacao.primeiro_admin_id(conn) == primeiro


def test_sem_admin_devolve_none(conn):
    criar_usuario(conn, "c1", SENHA, "coordenador")
    conn.commit()
    assert implantacao.primeiro_admin_id(conn) is None


def test_admin_desativado_ainda_e_o_primeiro(conn):
    primeiro = criar_usuario(conn, "a1", SENHA, "admin")
    criar_usuario(conn, "a2", SENHA, "admin")
    conn.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (primeiro,))
    conn.commit()
    assert implantacao.primeiro_admin_id(conn) == primeiro


def test_resumo_conta_casos_mensagens_anexos_arquivos_e_backups(conn, config):
    _popular(conn, config)
    (config.uploads_dir / "solto.bin").write_bytes(b"x")
    (config.backups_dir / "b1").mkdir(parents=True)
    (config.backups_dir / "b2").mkdir()
    caminho_backup_v2(config).write_bytes(b"bak")
    r = implantacao.resumo(conn, config)
    assert r["casos"] == 2
    assert r["mensagens"] == 2
    assert r["anexos"] == 2
    assert r["arquivos"] == 4  # 2 anexos, 1 foto, 1 solto
    assert r["backups"] == 3
    assert r["ultima_limpeza"] is None


def test_ultima_limpeza_nula_antes_e_preenchida_depois(conn, config):
    uid = criar_usuario(conn, "a1", SENHA, "admin")
    conn.commit()
    _popular(conn, config)
    assert implantacao.resumo(conn, config)["ultima_limpeza"] is None
    implantacao.limpar(conn, config, uid)
    ultima = implantacao.resumo(conn, config)["ultima_limpeza"]
    assert ultima["casos"] == 2
    assert ultima["por"] == "a1"
    assert ultima["em"]


def _estado(conn):
    return {
        "usuarios": [tuple(r) for r in conn.execute("SELECT * FROM usuarios ORDER BY id")],
        "ambientes": [tuple(r) for r in conn.execute("SELECT * FROM ambientes ORDER BY id")],
        "mapa": [tuple(r) for r in conn.execute("SELECT * FROM mapa_estado")],
    }


def test_limpar_apaga_filhos_e_preserva_usuarios_e_mapa(conn, config):
    uid = criar_usuario(conn, "a1", SENHA, "admin")
    conn.execute("INSERT INTO ambientes (id, nome, tipo, x, y, largura, altura) "
                 "VALUES ('s1', 'Sala', 'sala', 0, 0, 1, 1)")
    conn.commit()
    _popular(conn, config)
    antes = _estado(conn)
    assert antes["usuarios"] and antes["ambientes"]
    implantacao.limpar(conn, config, uid)
    assert _estado(conn) == antes
    for tabela in ("casos", "anexos", "mensagens", "mensagens_versoes",
                   "notas_internas", "eventos", "resolucoes", "autores_resolucao",
                   "situacoes_aluno", "revisoes_recorrencia", "envios",
                   "leituras_conversa"):
        assert conn.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0] == 0, tabela


def test_ids_recomecam_do_um(conn, config):
    _popular(conn, config)
    implantacao.limpar(conn, config, None)
    assert _caso(conn, config) == 1
    assert conn.execute("SELECT MIN(id) FROM eventos").fetchone()[0] == 1


def test_arquivos_do_disco_sao_removidos_e_pasta_uploads_permanece(conn, config):
    _popular(conn, config)
    (config.uploads_dir / "solto.bin").write_bytes(b"x")
    r = implantacao.limpar(conn, config, None)
    assert config.uploads_dir.is_dir()
    assert _arquivos(config) == []
    assert r["arquivos"] == 4


def test_backups_apagados_por_padrao_e_preservados_com_false(conn, config):
    pasta = config.backups_dir / "b1"
    pasta.mkdir(parents=True)
    (pasta / "seguranca.db").write_bytes(b"d")
    caminho_backup_v2(config).write_bytes(b"bak")

    r = implantacao.limpar(conn, config, None, apagar_backups=False)
    assert r["backups"] == 0
    assert (pasta / "seguranca.db").exists()
    assert caminho_backup_v2(config).exists()

    r = implantacao.limpar(conn, config, None)
    assert r["backups"] == 2
    assert not pasta.exists()
    assert not caminho_backup_v2(config).exists()
    assert config.backups_dir.is_dir()


BAKS = ("seguranca.db.pre-v2.bak", "seguranca.db.pre-v3.bak",
        "seguranca.db.pre-v4.bak", "seguranca.db.pre-mapa-l.bak",
        "seguranca.db.pre-atendimento.bak")
PARECIDOS = ("seguranca.db.bak", "seguranca.db.pre-v3.bak.txt", "config.json.bak",
             "outro.db.pre-v3.bak")


def test_todas_as_copias_pre_bak_sao_apagadas_e_parecidas_ficam(conn, config):
    for n in BAKS + PARECIDOS:
        (config.data_dir / n).write_bytes(b"copia")
    assert implantacao.resumo(conn, config)["backups"] == len(BAKS)
    r = implantacao.limpar(conn, config, None)
    assert r["backups"] == len(BAKS)
    for n in BAKS:
        assert not (config.data_dir / n).exists(), n
    for n in PARECIDOS:
        assert (config.data_dir / n).exists(), n
    assert config.db_path.is_file()


def test_copias_pre_bak_preservadas_com_apagar_backups_falso(conn, config):
    for n in BAKS:
        (config.data_dir / n).write_bytes(b"copia")
    r = implantacao.limpar(conn, config, None, apagar_backups=False)
    assert r["backups"] == 0
    for n in BAKS:
        assert (config.data_dir / n).exists(), n


def test_symlink_em_uploads_remove_so_o_link(conn, config, tmp_path_factory):
    fora = tmp_path_factory.mktemp("fora") / "importante.txt"
    fora.write_text("nao apagar", encoding="utf-8")
    config.uploads_dir.mkdir(parents=True, exist_ok=True)
    link = config.uploads_dir / "x.png"
    try:
        link.symlink_to(fora)
    except (OSError, NotImplementedError) as erro:
        pytest.skip(f"sem permissao para criar symlink: {erro}")
    implantacao.limpar(conn, config, None)
    assert not link.is_symlink()
    assert fora.read_text(encoding="utf-8") == "nao apagar"


def test_link_simulado_nunca_segue_o_alvo(conn, config, monkeypatch):
    """Simula um link: o alvo (resolve) nunca pode ser tocado."""
    config.uploads_dir.mkdir(parents=True, exist_ok=True)
    entrada = config.uploads_dir / "x.png"
    entrada.write_bytes(b"x")
    apagados, resolvidos = [], []
    original_unlink = Path.unlink
    monkeypatch.setattr(Path, "is_symlink",
                        lambda self: self.name == "x.png")
    monkeypatch.setattr(Path, "resolve",
                        lambda self, *a, **k: resolvidos.append(self) or self)

    def unlink(self, *a, **k):
        apagados.append(self.name)
        return original_unlink(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", unlink)
    implantacao.limpar(conn, config, None)
    assert apagados.count("x.png") == 1
    assert not any(p.name == "x.png" for p in resolvidos)


def test_avisos_agregados(conn, config, monkeypatch):
    _popular(conn, config)
    original = Path.unlink

    def unlink(self, *a, **k):
        if self.parent == config.uploads_dir.resolve() or self.parent == config.uploads_dir:
            raise PermissionError("em uso")
        return original(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", unlink)
    r = implantacao.limpar(conn, config, None)
    assert r["avisos"] == ["3 arquivos nao puderam ser removidos"]


def test_arquivos_de_configuracao_permanecem(conn, config):
    nomes = ("config.json", "secret.key", "sessao.key", "risk_terms.json")
    for n in nomes:
        (config.data_dir / n).write_text("{}", encoding="utf-8")
    _popular(conn, config)
    implantacao.limpar(conn, config, None)
    for n in nomes:
        assert (config.data_dir / n).is_file()


def test_texto_unico_nao_sobra_nos_bytes_do_banco(conn, config):
    marca = "MARCA-UNICA-7f3a9c1e-ZZ"
    i = _caso(conn, config, relato=f"relato {marca} longo " * 20)
    adicionar_mensagem(conn, i, "aluno", f"mensagem {marca}")
    conn.commit()
    # o marcador precisa estar no arquivo principal antes da limpeza
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    assert marca.encode() in config.db_path.read_bytes()
    implantacao.limpar(conn, config, None)
    conn.close()
    for sufixo in ("", "-wal", "-shm"):
        caminho = config.data_dir / f"seguranca.db{sufixo}"
        if caminho.exists():
            assert marca.encode() not in caminho.read_bytes(), sufixo


def test_falha_no_banco_nao_apaga_arquivos(conn, config):
    _popular(conn, config)
    antes = _arquivos(config)
    conn.execute("CREATE TRIGGER impede BEFORE DELETE ON casos "
                 "BEGIN SELECT RAISE(ABORT, 'falha forcada'); END")
    conn.commit()
    with pytest.raises(sqlite3.DatabaseError):
        implantacao.limpar(conn, config, None)
    assert _arquivos(config) == antes
    assert conn.execute("SELECT COUNT(*) FROM casos").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM limpezas_implantacao").fetchone()[0] == 0


def test_falha_ao_remover_arquivo_gera_aviso_e_nao_desfaz(conn, config, monkeypatch):
    _popular(conn, config)
    original = Path.unlink
    travado = {}

    def unlink(self, *a, **k):
        travado.setdefault("nome", self.name)
        if self.name == travado["nome"]:
            raise PermissionError("em uso")
        return original(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", unlink)
    r = implantacao.limpar(conn, config, None)
    assert len(r["avisos"]) == 1
    assert conn.execute("SELECT COUNT(*) FROM casos").fetchone()[0] == 0
    assert _arquivos(config) == [travado["nome"]]


def test_limpar_sem_nada_devolve_zeros(conn, config):
    assert implantacao.limpar(conn, config, None) == {
        "casos": 0, "mensagens": 0, "anexos": 0, "arquivos": 0, "backups": 0,
        "avisos": []}


def test_registra_limpeza_com_contagens_sem_texto(conn, config):
    uid = criar_usuario(conn, "a1", SENHA, "admin")
    conn.commit()
    _popular(conn, config)
    (config.backups_dir / "b1").mkdir(parents=True)
    implantacao.limpar(conn, config, uid)
    linhas = conn.execute("SELECT * FROM limpezas_implantacao").fetchall()
    assert len(linhas) == 1
    linha = linhas[0]
    assert linha["usuario_id"] == uid
    assert (linha["casos"], linha["mensagens"], linha["anexos"],
            linha["backups"]) == (2, 2, 2, 1)
    assert not any(isinstance(v, str) and RELATO in v for v in tuple(linha))


def test_migracao_cria_tabela_em_banco_antigo(config):
    init_db(config)
    c = connect(config)
    c.execute("DROP TABLE limpezas_implantacao")
    c.commit()
    c.close()
    init_db(config)
    init_db(config)
    c = connect(config)
    try:
        cols = {r[1] for r in c.execute("PRAGMA table_info(limpezas_implantacao)")}
    finally:
        c.close()
    assert cols == {"id", "usuario_id", "criado_em", "casos", "mensagens",
                    "anexos", "backups"}
