"""Configuração do sistema: pastas de dados, portas e chave secreta."""
from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from pathlib import Path

DATA_DIR_PADRAO = Path(r"C:\ProgramData\SegurancaIntegral")
# portas do config.json: fora das privilegiadas e dentro do limite do TCP
PORTA_MIN = 1024
PORTA_MAX = 65535


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
        # cópia em data_dir permite editar os termos sem recompilar
        copia = self.data_dir / "risk_terms.json"
        if copia.exists():
            return copia
        return Path(__file__).parent / "risk_terms.json"


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

    extras = _ler_config_json(pasta / "config.json")
    return Config(data_dir=pasta, secret_key=chave, **extras)


def _porta(dados: dict, nome: str, padrao: int) -> int:
    valor = dados.get(nome, padrao)
    # bool é subclasse de int: "true" no JSON não pode virar porta 1
    if type(valor) is not int or not PORTA_MIN <= valor <= PORTA_MAX:
        raise ValueError(
            f"config.json: {nome} precisa ser um inteiro de {PORTA_MIN} a {PORTA_MAX}"
        )
    return valor


def _ler_config_json(arquivo: Path) -> dict:
    """Lê e valida o config.json opcional; erro vira ValueError (saída 4)."""
    if not arquivo.exists():
        return {}
    # utf-8-sig: o PowerShell 5.1 e o Bloco de Notas antigo gravam com BOM
    dados = json.loads(arquivo.read_text(encoding="utf-8-sig"))
    if not isinstance(dados, dict):
        raise ValueError("config.json precisa ser um objeto JSON")

    hosts = dados.get("allowed_hosts", [])
    if not isinstance(hosts, list) or not all(isinstance(h, str) for h in hosts):
        raise ValueError("config.json: allowed_hosts precisa ser uma lista de textos")

    aluno = _porta(dados, "student_port", 3000)
    coord = _porta(dados, "coord_port", 4000)
    if aluno == coord:
        raise ValueError("config.json: student_port e coord_port precisam ser diferentes")
    return {"allowed_hosts": tuple(hosts), "student_port": aluno, "coord_port": coord}
