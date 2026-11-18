"""Orientação imediata ao aluno: textos versionados em orientacoes.json.

O conteúdo é fixo e escrito pela escola; nada aqui depende do relato nem de
dados da coordenação. A rota devolve só os blocos das situações pedidas.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_ID = re.compile(r"[a-z0-9-]{1,40}")
MAX_SITUACOES = 40
MAX_TITULO = 120
MAX_PASSO = 400
MAX_PASSOS = 8


class OrientacoesInvalidas(ValueError):
    """orientacoes.json ilegível ou fora do formato esperado."""


def _bloco(dados, onde: str) -> dict:
    if not isinstance(dados, dict) or set(dados) != {"titulo", "passos"}:
        raise OrientacoesInvalidas(f"{onde}: use apenas titulo e passos")
    titulo, passos = dados["titulo"], dados["passos"]
    if not isinstance(titulo, str) or not 1 <= len(titulo.strip()) <= MAX_TITULO:
        raise OrientacoesInvalidas(f"{onde}: titulo invalido")
    if not isinstance(passos, list) or not 1 <= len(passos) <= MAX_PASSOS:
        raise OrientacoesInvalidas(f"{onde}: passos precisa ser uma lista nao vazia")
    for passo in passos:
        if not isinstance(passo, str) or not 1 <= len(passo.strip()) <= MAX_PASSO:
            raise OrientacoesInvalidas(f"{onde}: passo invalido")
    return {"titulo": titulo.strip(), "passos": [p.strip() for p in passos]}


@dataclass(frozen=True)
class Orientacoes:
    geral: dict
    situacoes: dict

    def para_aluno(self, ids: list[str], contatos: tuple = ()) -> dict:
        """Bloco geral e os das situações pedidas (desconhecidas são ignoradas)."""
        vistos: list[str] = []
        for i in ids:
            if i in self.situacoes and i not in vistos:
                vistos.append(i)
        return {"geral": self.geral,
                "situacoes": [{"id": i, **self.situacoes[i]} for i in vistos],
                "contatos": [dict(c) for c in contatos]}


def carregar(caminho: Path) -> Orientacoes:
    try:
        dados = json.loads(Path(caminho).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as erro:
        raise OrientacoesInvalidas("orientacoes.json ilegivel") from erro
    if not isinstance(dados, dict) or not isinstance(dados.get("situacoes"), dict):
        raise OrientacoesInvalidas("orientacoes.json: faltam geral e situacoes")
    geral = _bloco(dados.get("geral"), "geral")
    situacoes = {}
    for id_, bloco in dados["situacoes"].items():
        if not isinstance(id_, str) or not _ID.fullmatch(id_):
            raise OrientacoesInvalidas(f"id de situacao invalido: {id_!r}")
        situacoes[id_] = _bloco(bloco, id_)
    return Orientacoes(geral, situacoes)


def ids_pedidos(bruto: str) -> list[str] | None:
    """Lista de ids do parâmetro `situacoes`; None se passar do limite."""
    partes = [p.strip() for p in bruto.split(",") if p.strip()]
    if len(partes) > MAX_SITUACOES:
        return None
    return [p for p in partes if _ID.fullmatch(p)]
