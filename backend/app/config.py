"""Configuração do sistema: pastas de dados, portas e chave secreta."""
from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from pathlib import Path

DATA_DIR_PADRAO = Path(r"C:\ProgramData\SegurancaIntegral")


@dataclass(frozen=True)
class Config:
    data_dir: Path
    secret_key: str
    host: str = "127.0.0.1"
    student_port: int = 3000
    coord_port: int = 4000
    allowed_hosts: tuple[str, ...] = ()

    @property
    def db_path(self) -> Path:
        return self.data_dir / "seguranca.db"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def risk_terms_path(self) -> Path:
        return self.data_dir / "risk_terms.json"


def load_config(data_dir: Path | None = None) -> Config:
    """Carrega a configuração, criando a pasta e a chave na primeira execução."""
    pasta = Path(data_dir) if data_dir is not None else DATA_DIR_PADRAO
    pasta.mkdir(parents=True, exist_ok=True)

    arquivo_chave = pasta / "secret.key"
    if arquivo_chave.exists():
        chave = arquivo_chave.read_text(encoding="utf-8").strip()
    else:
        chave = secrets.token_hex(32)  # 32 bytes aleatórios em hexadecimal
        arquivo_chave.write_text(chave, encoding="utf-8")

    hosts: tuple[str, ...] = ()
    arquivo_json = pasta / "config.json"
    if arquivo_json.exists():
        dados = json.loads(arquivo_json.read_text(encoding="utf-8"))
        hosts = tuple(dados.get("allowed_hosts", ()))

    return Config(data_dir=pasta, secret_key=chave, allowed_hosts=hosts)
