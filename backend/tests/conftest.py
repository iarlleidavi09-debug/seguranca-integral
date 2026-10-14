import pytest

from app.config import Config
from app.db import connect, init_db


@pytest.fixture
def config(tmp_path):
    """Config isolada em diretório temporário."""
    return Config(data_dir=tmp_path, secret_key="chave-de-teste")


@pytest.fixture
def conn(config):
    """Conexão com o banco já inicializado."""
    init_db(config)
    c = connect(config)
    yield c
    c.close()


@pytest.fixture
def student_client(config):
    """Cliente de teste do portal do aluno, com banco novo e limites folgados."""
    from app import create_student_app

    app = create_student_app(
        config, limites={"denuncias": (1000, 600), "consultas": (1000, 600)}
    )
    return app.test_client()


SENHA_COORD = "senha-forte-123"


@pytest.fixture
def coord_app(config):
    """Aplicação da coordenação com limite de login folgado."""
    from app import create_coord_app

    return create_coord_app(config, limites={"login": (1000, 600)})


@pytest.fixture
def coord_client(coord_app):
    """Cliente de teste da coordenação, sem sessão."""
    return coord_app.test_client()


@pytest.fixture
def coord_logado(config, coord_client):
    """Cliente da coordenação já logado como `coord`."""
    from app.auth import criar_usuario

    c = connect(config)
    try:
        criar_usuario(c, "coord", SENHA_COORD)
    finally:
        c.close()
    r = coord_client.post("/api/login", json={"nome": "coord", "senha": SENHA_COORD})
    assert r.status_code == 200
    return coord_client
