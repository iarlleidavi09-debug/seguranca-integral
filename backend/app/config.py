"""Configuração do sistema: pastas de dados, portas e chave secreta."""
from __future__ import annotations

import ipaddress
import json
import os
import re
import secrets
from dataclasses import dataclass, field
from pathlib import Path

DATA_DIR_PADRAO = Path(r"C:\ProgramData\SegurancaIntegral")
# portas do config.json: fora das privilegiadas e dentro do limite do TCP
PORTA_MIN = 1024
PORTA_MAX = 65535
# limites de taxa ajustáveis no config.json: nome -> (máximo, janela em s) ou None
LIMITES_NOMES = ("denuncias", "consultas", "login")
LIMITE_TETO_MAXIMO = 1_000_000
LIMITE_TETO_JANELA = 86_400  # um dia
# chaves gravadas em data_dir: 32 bytes aleatórios em hexadecimal minúsculo
_CHAVE_HEX = re.compile(r"[0-9a-f]{64}")


def _nova_chave() -> str:
    return secrets.token_hex(32)


@dataclass(frozen=True)
class Config:
    data_dir: Path
    secret_key: str
    # assina o cookie da sessão da coordenação; separada da secret_key para
    # poder ser trocada (derrubando as sessões) sem invalidar os códigos
    sessao_key: str = field(default_factory=_nova_chave)
    host: str = "0.0.0.0"
    student_port: int = 3000
    coord_port: int = 4000
    allowed_hosts: tuple[str, ...] = ()
    # vazio = limites padrão do código; ver _limites() para o formato
    limites: dict = field(default_factory=dict)
    # implantação secundária: habilita a limpeza dos dados de teste (config.json)
    implantacao_secundaria: bool = False
    # alertas por e-mail (SMTP); vazio = recurso desligado. repr=False: o dicionário
    # pode trazer a senha do SMTP e a Config aparece em tracebacks e logs
    alertas: dict = field(default_factory=dict, repr=False)

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

    @property
    def questionario_path(self) -> Path:
        # cópia em data_dir permite ajustar o questionário sem recompilar
        copia = self.data_dir / "questionario.json"
        if copia.exists():
            return copia
        return Path(__file__).parent / "questionario.json"

    @property
    def questionario_v3_path(self) -> Path:
        copia = self.data_dir / "questionario_v3.json"
        return copia if copia.exists() else Path(__file__).parent / "questionario_v3.json"


def load_config(data_dir: Path | None = None) -> Config:
    """Carrega a configuração, criando a pasta e a chave na primeira execução."""
    pasta = Path(data_dir) if data_dir is not None else DATA_DIR_PADRAO
    pasta.mkdir(parents=True, exist_ok=True)

    chave = _chave_persistente(pasta, "secret.key")
    sessao = _chave_persistente(pasta, "sessao.key")

    extras = _ler_config_json(pasta / "config.json")
    return Config(data_dir=pasta, secret_key=chave, sessao_key=sessao, **extras)


def _ler_chave(arquivo: Path) -> str:
    # strip: um Bloco de Notas que acrescente quebra de linha não derruba nada
    texto = arquivo.read_text(encoding="utf-8").strip()
    if not _CHAVE_HEX.fullmatch(texto):
        raise ValueError(f"{arquivo.name} invalida")
    return texto


def _chave_persistente(pasta: Path, nome: str) -> str:
    """Lê a chave `nome`; se não existe, cria de forma atômica.

    A chave nova vai para um temporário na mesma pasta (com fsync) e é
    publicada com os.link, que falha se o destino já existe: nunca
    sobrescreve uma chave, e dois processos que criam ao mesmo tempo acabam
    usando a mesma (o perdedor relê a do vencedor).
    """
    arquivo = pasta / nome
    if arquivo.exists():
        return _ler_chave(arquivo)
    nova = _nova_chave()
    temp = pasta / f".{nome}.{secrets.token_hex(8)}.tmp"
    try:
        with open(temp, "x", encoding="utf-8") as saida:
            saida.write(nova)
            saida.flush()
            os.fsync(saida.fileno())
        try:
            os.link(temp, arquivo)
        except FileExistsError:
            return _ler_chave(arquivo)
        except OSError:
            # sistema de arquivos sem link físico: criação exclusiva direta
            try:
                with open(arquivo, "x", encoding="utf-8") as saida:
                    saida.write(nova)
                    saida.flush()
                    os.fsync(saida.fileno())
            except FileExistsError:
                return _ler_chave(arquivo)
    finally:
        temp.unlink(missing_ok=True)
    return nova


def trocar_chave_de_sessao(pasta: Path) -> None:
    """Apaga e recria sessao.key: as sessões abertas morrem na próxima partida."""
    (Path(pasta) / "sessao.key").unlink(missing_ok=True)
    _chave_persistente(Path(pasta), "sessao.key")


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
    """Valida `limites`: {"denuncias": [máximo, janela_s] ou null, ...}."""
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
        if par is None:  # null desliga o limite
            limites[nome] = None
            continue
        if (not isinstance(par, list) or len(par) != 2
                or not _inteiro_positivo(par[0], LIMITE_TETO_MAXIMO)
                or not _inteiro_positivo(par[1], LIMITE_TETO_JANELA)):
            raise ValueError(
                f"config.json: limites.{nome} precisa ser null ou "
                f"[maximo, janela_em_segundos] "
                f"com inteiros positivos (maximo ate {LIMITE_TETO_MAXIMO}, "
                f"janela ate {LIMITE_TETO_JANELA})"
            )
        limites[nome] = (par[0], par[1])
    return limites


# endereço de e-mail simples e sem espaço, vírgula ou quebra de linha (anti injeção de cabeçalho)
_EMAIL = re.compile(
    r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+"
)
SEGURANCAS_SMTP = ("starttls", "ssl", "nenhuma")


def email_valido(valor) -> bool:
    return isinstance(valor, str) and len(valor) <= 254 and _EMAIL.fullmatch(valor) is not None


def _alertas(dados: dict) -> dict:
    """Valida `alertas.smtp` do config.json. Sem host ou remetente: desligado.

    Usuário e senha também vêm de SI_SMTP_USUARIO e SI_SMTP_SENHA, que valem
    mais que o arquivo. Os erros nunca citam os valores (a senha é segredo).
    """
    bruto = dados.get("alertas")
    if bruto is None:
        return {}
    if not isinstance(bruto, dict):
        raise ValueError("config.json: alertas precisa ser um objeto")
    smtp = bruto.get("smtp", {})
    if not isinstance(smtp, dict):
        raise ValueError("config.json: alertas.smtp precisa ser um objeto")
    host, remetente = smtp.get("host"), smtp.get("remetente")
    if not host or not remetente:
        return {}
    if not isinstance(host, str) or any(c.isspace() for c in host) or len(host) > 253:
        raise ValueError("config.json: alertas.smtp.host invalido")
    if not email_valido(remetente):
        raise ValueError("config.json: alertas.smtp.remetente precisa ser um e-mail valido")
    seguranca = smtp.get("seguranca", "starttls")
    if seguranca not in SEGURANCAS_SMTP:
        raise ValueError(f"config.json: alertas.smtp.seguranca precisa ser {', '.join(SEGURANCAS_SMTP)}")
    padrao_porta = {"starttls": 587, "ssl": 465, "nenhuma": 25}[seguranca]
    porta = smtp.get("porta", padrao_porta)
    if type(porta) is not int or not 1 <= porta <= 65535:
        raise ValueError("config.json: alertas.smtp.porta invalida")
    usuario = os.environ.get("SI_SMTP_USUARIO") or smtp.get("usuario") or ""
    senha = os.environ.get("SI_SMTP_SENHA") or smtp.get("senha") or ""
    if not isinstance(usuario, str) or not isinstance(senha, str):
        raise ValueError("config.json: alertas.smtp.usuario e senha precisam ser textos")
    link = bruto.get("link_painel", "")
    if link and (not isinstance(link, str) or not re.fullmatch(r"https?://[^\s<>\"]{1,300}", link)):
        raise ValueError("config.json: alertas.link_painel precisa ser um endereco http ou https")
    hora = bruto.get("resumo_hora")
    if hora is not None and (not isinstance(hora, str)
                             or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", hora)):
        raise ValueError("config.json: alertas.resumo_hora precisa ser HH:MM ou null")
    return {"smtp": {"host": host, "porta": porta, "seguranca": seguranca,
                     "usuario": usuario, "senha": senha, "remetente": remetente},
            "link_painel": link or "", "resumo_hora": hora}


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

    host = dados.get("host", "0.0.0.0")
    try:
        if not isinstance(host, str):
            raise TypeError
        # Endereço IPv4 literal; instalações novas atendem a rede local.
        ipaddress.IPv4Address(host)
    except (ValueError, TypeError):
        raise ValueError("config.json: host precisa ser um endereco IPv4, ex.: 0.0.0.0")

    aluno = _porta(dados, "student_port", 3000)
    coord = _porta(dados, "coord_port", 4000)
    if aluno == coord:
        raise ValueError("config.json: student_port e coord_port precisam ser diferentes")
    # só o booleano de verdade vale: "true", 1 e null são rejeitados
    implantacao = dados.get("implantacao_secundaria", False)
    if type(implantacao) is not bool:
        raise ValueError("config.json: implantacao_secundaria precisa ser true ou false")
    return {"host": host, "allowed_hosts": tuple(hosts), "student_port": aluno,
            "coord_port": coord, "limites": _limites(dados),
            "implantacao_secundaria": implantacao, "alertas": _alertas(dados)}
