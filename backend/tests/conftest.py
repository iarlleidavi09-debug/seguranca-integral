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
