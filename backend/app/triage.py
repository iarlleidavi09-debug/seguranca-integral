"""Triagem por regras: calcula a prioridade de um caso sem usar IA."""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

PESO_TIPO = {
    "aliciamento": 4,
    "ameaca": 4,
    "vazamento": 3,
    "golpe": 3,
    "perfil_falso": 2,
    "cyberbullying": 2,
    "outro": 1,
}
PONTOS_EM_ANDAMENTO = 2
PONTOS_CATEGORIA = 3
LIMIAR_ALTA = 6
LIMIAR_MEDIA = 3


@dataclass(frozen=True)
class Triagem:
    prioridade: str
    pontos: int
    motivos: tuple[str, ...]


def _normalizar(texto: str) -> str:
    """Minúsculas e sem acentos (NFKD removendo combinantes)."""
    decomposto = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def carregar_termos(path: Path) -> dict[str, list[str]]:
    """Lê o JSON de categorias de risco (categoria -> lista de termos)."""
    dados = json.loads(Path(path).read_text(encoding="utf-8"))
    return {str(cat): [str(t) for t in termos] for cat, termos in dados.items()}


def _contem(texto: str, termo: str) -> bool:
    """Compara por palavra ou expressão inteira, não por pedaço de palavra."""
    alvo = _normalizar(termo).strip()
    if not alvo:
        return False
    padrao = r"(?<!\w)" + r"\s+".join(re.escape(p) for p in alvo.split()) + r"(?!\w)"
    return re.search(padrao, texto) is not None


def _alertas(tipo: str, categorias: list[str], em_andamento: bool) -> list[str]:
    """Alertas fixos que elevam o caso a crítica, independentemente dos pontos."""
    achadas = set(categorias)
    alertas = []
    if (tipo in ("aliciamento", "ameaca") and em_andamento
            and achadas & {"violencia", "automutilacao"}):
        alertas.append("alerta: ameaca com violencia em andamento")
    if em_andamento and "automutilacao" in achadas:
        alertas.append("alerta: risco de automutilacao em andamento")
    if {"nudes", "extorsao"} <= achadas:
        alertas.append("alerta: conteudo intimo com extorsao")
    return alertas


def classificar(
    tipo: str, relato: str, em_andamento: bool, termos: dict[str, list[str]],
    extra_pontos: int = 0, extra_motivos: tuple[str, ...] = (),
    alertas: tuple[str, ...] = (), limiares: tuple[int, int] = (LIMIAR_ALTA, LIMIAR_MEDIA),
) -> Triagem:
    pontos = PESO_TIPO.get(tipo, PESO_TIPO["outro"])
    motivos = [f"tipo: {tipo}"]
    if em_andamento:
        pontos += PONTOS_EM_ANDAMENTO
        motivos.append("ocorrendo agora")

    texto = _normalizar(relato or "")
    categorias: list[str] = []
    for categoria, lista in termos.items():
        # cada categoria conta uma vez, mesmo com vários acertos
        if any(_contem(texto, t) for t in lista):
            pontos += PONTOS_CATEGORIA
            categorias.append(categoria)
            motivos.append(f"termos de risco: {categoria}")

    # pesos do questionário somam antes das faixas
    pontos += extra_pontos
    motivos.extend(extra_motivos)

    limiar_alta, limiar_media = limiares
    if pontos >= limiar_alta:
        prioridade = "alta"
    elif pontos >= limiar_media:
        prioridade = "media"
    else:
        prioridade = "baixa"
    # os alertas elevam depois da soma; os pontos não mudam
    todos_alertas = _alertas(tipo, categorias, em_andamento) + list(alertas)
    if todos_alertas:
        prioridade = "critica"
        motivos.extend(todos_alertas)
    return Triagem(prioridade, pontos, tuple(motivos))
