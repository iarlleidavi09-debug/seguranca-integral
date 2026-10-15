"""Configuração do sistema: pastas de dados, portas e chave secreta."""
from __future__ import annotations

import json
import secrets
from dataclasses import dataclass, field
from pathlib import Path

DATA_DIR_PADRAO = Path(r"C:\ProgramData\SegurancaIntegral")
# portas do config.json: fora das privilegiadas e dentro do limite do TCP
PORTA_MIN = 1024
PORTA_MAX = 65535
# limites de taxa ajustáveis no config.json (só para ensaio): nome -> (máximo, janela em s)
LIMITES_NOMES = ("denuncias", "consultas", "login")
LIMITE_TETO_MAXIMO = 1_000_000
LIMITE_TETO_JANELA = 86_400  # um dia


@dataclass(frozen=True)
class Config:
    data_dir: Path
    secret_key: str
    host: str = "127.0.0.1"
    student_port: int = 3000
    coord_port: int = 4000
    allowed_hosts: tuple[str, ...] = ()
    # vazio = limites padrão do código; ver _limites() para o formato
    limites: dict = field(default_factory=dict)

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


def _inteiro_positivo(valor, teto: int) -> bool:
    # bool é subclasse de int: [true, 600] não vale
    return type(valor) is int and 1 <= valor <= teto


def _limites(dados: dict) -> dict:
    """Valida `limites`: {"denuncias": [máximo, janela_s], ...}, só para ensaio."""
    bruto = dados.get("limites", {})
    if not isinstance(bruto, dict):
        raise ValueError("config.json: limites precisa ser um objeto")
    limites = {}
    for nome, par in bruto.items():
        if nome not in LIMITES_NOMES:
            raise ValueError(
                f"config.json: limites.{nome} desconhecido "
                f"(use {', '.join(LIMITES_NOMES)})"
            )
        if (not isinstance(par, list) or len(par) != 2
                or not _inteiro_positivo(par[0], LIMITE_TETO_MAXIMO)
                or not _inteiro_positivo(par[1], LIMITE_TETO_JANELA)):
            raise ValueError(
                f"config.json: limites.{nome} precisa ser [maximo, janela_em_segundos] "
                f"com inteiros positivos (maximo ate {LIMITE_TETO_MAXIMO}, "
                f"janela ate {LIMITE_TETO_JANELA})"
            )
        limites[nome] = (par[0], par[1])
    return limites


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
    return {"allowed_hosts": tuple(hosts), "student_port": aluno,
            "coord_port": coord, "limites": _limites(dados)}
