"""Definição do questionário adaptativo: carga e validação.

O arquivo `questionario.json` (ou a cópia em data_dir) descreve situações,
opções, perguntas, pesos, alertas e faixas. Aqui ele é lido e conferido na
partida: uma definição quebrada para o servidor com mensagem clara em vez de
falhar no meio de uma denúncia.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .casos import TIPOS

DIMENSOES = ("quando", "frequencia", "alcance", "consequencias", "risco")
TIPOS_PERGUNTA = ("unica", "multipla")
_TRAVESSOES = ("—", "–")


class QuestionarioInvalido(ValueError):
    """A definição do questionário não passa na validação."""


class RespostasInvalidas(ValueError):
    """As respostas enviadas pelo aluno não conferem com a definição."""


MAX_BYTES_RESPOSTAS = 8192
MAX_IDS_RESPOSTAS = 60


@dataclass(frozen=True)
class Questionario:
    dados: dict

    def para_aluno(self) -> dict:
        """Só o que o portal do aluno precisa; pesos, alertas e faixas ficam de fora."""
        return {
            "situacoes": self.dados["situacoes"],
            "dimensoes": self.dados["dimensoes"],
            "perguntas": self.dados["perguntas"],
        }

    def pontuar(self, respostas: dict | None) -> tuple[int, list[str], list[str]]:
        """(pontos extras, motivos de peso, motivos de alerta) das respostas.

        Só os ids em `respostas["respostas"]` contam; os de `marcadas` não
        pontuam. Um motivo de peso por resposta com peso diferente de zero,
        na ordem das respostas. O alerta dispara com todas as respostas da
        sua lista presentes.
        """
        if not respostas:
            return 0, [], []
        ids = [i for lista in (respostas.get("respostas") or {}).values() for i in lista]
        pesos = self.dados.get("pesos") or {}
        textos = {r["id"]: r["texto"] for p in self.dados.get("perguntas", [])
                  for r in p["respostas"]}
        pontos = 0
        motivos: list[str] = []
        for rid in ids:
            peso = pesos.get(rid, 0)
            if peso:
                pontos += peso
                motivos.append(f"resposta: {textos.get(rid, rid)} ({peso:+d})")
        presentes = set(ids)
        alertas = [a["motivo"] for a in self.dados.get("alertas") or []
                   if set(a["todas"]) <= presentes]
        return pontos, motivos, alertas

    def limiares(self) -> tuple[int, int]:
        """(alta, média) das faixas da definição; padrão 6 e 3."""
        faixas = self.dados.get("faixas") or {}
        return faixas.get("alta", 6), faixas.get("media", 3)

    def validar_respostas(self, bruto: str | None, tipo: str) -> dict | None:
        """Confere o JSON enviado pelo aluno e devolve o dicionário normalizado.

        `None` ou texto vazio significam "sem respostas". Duplicados são
        rejeitados (não deduplicados). Não confere alcance por `mostrar_se`:
        decisão de protótipo.
        """
        if bruto is None or not bruto.strip():
            return None
        if len(bruto.encode("utf-8")) > MAX_BYTES_RESPOSTAS:
            raise RespostasInvalidas("texto grande demais")
        try:
            dado = json.loads(bruto)
        except (ValueError, RecursionError):
            raise RespostasInvalidas("JSON invalido") from None
        if not isinstance(dado, dict):
            raise RespostasInvalidas("precisa ser um objeto")

        situacao_id, marcadas, respostas = (
            dado.get("situacao"), dado.get("marcadas"), dado.get("respostas"))
        if not isinstance(situacao_id, str):
            raise RespostasInvalidas("situacao ausente")
        if not isinstance(marcadas, list) or not isinstance(respostas, dict):
            raise RespostasInvalidas("formato errado")
        if any(not isinstance(v, list) for v in respostas.values()):
            raise RespostasInvalidas("respostas de cada pergunta precisam ser lista")
        total = len(marcadas) + sum(len(v) for v in respostas.values())
        if total > MAX_IDS_RESPOSTAS:
            raise RespostasInvalidas("ids demais")
        if any(not isinstance(i, str) for i in marcadas) or any(
                not isinstance(i, str) for v in respostas.values() for i in v):
            raise RespostasInvalidas("ids precisam ser texto")

        situacao = next((s for s in self.dados["situacoes"] if s["id"] == situacao_id), None)
        if situacao is None:
            raise RespostasInvalidas("situacao inexistente")
        if situacao["tipo"] != tipo:
            raise RespostasInvalidas("tipo diferente do da situacao")
        opcoes = {o["id"] for o in situacao["opcoes"]}
        if len(set(marcadas)) != len(marcadas):
            raise RespostasInvalidas("opcao repetida")
        if any(i not in opcoes for i in marcadas):
            raise RespostasInvalidas("opcao fora da situacao")

        perguntas = {p["id"]: p for p in self.dados["perguntas"]}
        for pid, ids in respostas.items():
            pergunta = perguntas.get(pid)
            if pergunta is None:
                raise RespostasInvalidas("pergunta inexistente")
            validos = {r["id"] for r in pergunta["respostas"]}
            if len(set(ids)) != len(ids):
                raise RespostasInvalidas("resposta repetida")
            if any(i not in validos for i in ids):
                raise RespostasInvalidas("resposta nao pertence a pergunta")
            if pergunta["tipo"] == "unica" and len(ids) > 1:
                raise RespostasInvalidas("pergunta de resposta unica")
        return {
            "situacao": situacao_id,
            "marcadas": list(marcadas),
            "respostas": {pid: list(ids) for pid, ids in respostas.items()},
        }


def _erro(msg: str) -> QuestionarioInvalido:
    return QuestionarioInvalido(f"questionario: {msg}")


def _textos(valor, onde: str = "arquivo"):
    """(id do item, texto) de toda a estrutura, para procurar travessão."""
    if isinstance(valor, str):
        yield onde, valor
    elif isinstance(valor, list):
        for item in valor:
            yield from _textos(item, onde)
    elif isinstance(valor, dict):
        onde = valor["id"] if isinstance(valor.get("id"), str) else onde
        for item in valor.values():
            yield from _textos(item, onde)


def _lista(dados: dict, campo: str) -> list:
    valor = dados.get(campo)
    if not isinstance(valor, list):
        raise _erro(f"{campo} precisa ser uma lista")
    return valor


def _textos_da_lista(lista, onde: str) -> None:
    for item in lista:
        if not isinstance(item, str):
            raise _erro(f"{onde}: itens precisam ser texto ({item!r})")


def _novo_id(item, vistos: set, onde: str) -> str:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
        raise _erro(f"{onde} sem id")
    if item["id"] in vistos:
        raise _erro(f"id duplicado: {item['id']}")
    vistos.add(item["id"])
    return item["id"]


def _validar(dados) -> None:
    if not isinstance(dados, dict):
        raise _erro("a definição precisa ser um objeto JSON")

    for onde, texto in _textos(dados):
        if any(t in texto for t in _TRAVESSOES):
            raise _erro(f"travessão longo em {onde}: {texto[:60]}")

    dimensoes = dados.get("dimensoes")
    if not isinstance(dimensoes, dict) or set(dimensoes) != set(DIMENSOES):
        raise _erro(f"dimensoes precisa ter exatamente {', '.join(DIMENSOES)}")

    # perguntas e respostas primeiro: as opções e regras apontam para elas
    perguntas = _lista(dados, "perguntas")
    ids_pergunta: set = set()
    ids_resposta: set = set()
    for p in perguntas:
        pid = _novo_id(p, ids_pergunta, "pergunta")
        if p.get("dimensao") not in DIMENSOES:
            raise _erro(f"pergunta {pid}: dimensao invalida ({p.get('dimensao')!r})")
        if p.get("tipo") not in TIPOS_PERGUNTA:
            raise _erro(f"pergunta {pid}: tipo invalido ({p.get('tipo')!r})")
        if not isinstance(p.get("texto"), str) or not p["texto"]:
            raise _erro(f"pergunta {pid}: sem texto")
        respostas = p.get("respostas")
        if not isinstance(respostas, list) or not respostas:
            raise _erro(f"pergunta {pid}: sem respostas")
        for r in respostas:
            # conjunto compartilhado: id de resposta único no arquivo todo
            rid = _novo_id(r, ids_resposta, f"resposta de {pid}")
            if not isinstance(r.get("texto"), str) or not r["texto"]:
                raise _erro(f"resposta {rid}: sem texto")

    for p in perguntas:
        mostrar = p.get("mostrar_se")
        if mostrar is None:
            continue
        if not isinstance(mostrar, list) or not mostrar:
            raise _erro(f"pergunta {p['id']}: mostrar_se precisa ser lista não vazia")
        _textos_da_lista(mostrar, f"pergunta {p['id']}: mostrar_se")
        proprias = {r["id"] for r in p["respostas"]}
        for rid in mostrar:
            if rid in proprias:
                raise _erro(f"pergunta {p['id']}: mostrar_se cita resposta da propria pergunta {rid}")
            if rid not in ids_resposta:
                raise _erro(f"pergunta {p['id']}: mostrar_se cita resposta inexistente {rid}")

    abertas: set = set()
    ids_situacao: set = set()
    ids_opcao: set = set()
    for s in _lista(dados, "situacoes"):
        sid = _novo_id(s, ids_situacao, "situacao")
        if s.get("tipo") not in TIPOS:
            raise _erro(f"situacao {sid}: tipo invalido ({s.get('tipo')!r})")
        for campo in ("nome", "descricao"):
            if not isinstance(s.get(campo), str) or not s[campo]:
                raise _erro(f"situacao {sid}: sem {campo}")
        opcoes = s.get("opcoes")
        if not isinstance(opcoes, list):
            raise _erro(f"situacao {sid}: opcoes precisa ser uma lista")
        for o in opcoes:
            oid = _novo_id(o, ids_opcao, f"opcao de {sid}")
            if not isinstance(o.get("texto"), str) or not o["texto"]:
                raise _erro(f"opcao {oid}: sem texto")
            citadas = o.get("perguntas")
            if not isinstance(citadas, list):
                raise _erro(f"opcao {oid}: perguntas precisa ser uma lista")
            _textos_da_lista(citadas, f"opcao {oid}: perguntas")
            for pid in citadas:
                if pid not in ids_pergunta:
                    raise _erro(f"opcao {oid}: cita pergunta inexistente {pid}")
                abertas.add(pid)

    for p in perguntas:
        if p["id"] not in abertas and not p.get("mostrar_se"):
            raise _erro(f"pergunta {p['id']}: nenhuma opcao a abre e nao tem mostrar_se")

    pesos = dados.get("pesos")
    if not isinstance(pesos, dict):
        raise _erro("pesos precisa ser um objeto")
    for rid, peso in pesos.items():
        if rid not in ids_resposta:
            raise _erro(f"pesos cita resposta inexistente {rid}")
        if type(peso) is not int:
            raise _erro(f"pesos: {rid} precisa ser inteiro")

    alertas = _lista(dados, "alertas")
    for a in alertas:
        todas = a.get("todas") if isinstance(a, dict) else None
        if not isinstance(todas, list) or not todas:
            raise _erro("alerta sem lista 'todas'")
        if not isinstance(a.get("motivo"), str) or not a["motivo"]:
            raise _erro("alerta sem motivo")
        _textos_da_lista(todas, "alerta: todas")
        for rid in todas:
            if rid not in ids_resposta:
                raise _erro(f"alerta cita resposta inexistente {rid}")

    faixas = dados.get("faixas")
    if (not isinstance(faixas, dict) or set(faixas) != {"alta", "media"}
            or any(type(v) is not int for v in faixas.values())):
        raise _erro("faixas precisa ter 'alta' e 'media' inteiros")


def carregar(caminho: Path) -> Questionario:
    """Lê e valida a definição; `QuestionarioInvalido` diz o que está errado."""
    caminho = Path(caminho)
    try:
        # utf-8-sig: o Bloco de Notas antigo grava com BOM
        texto = caminho.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        raise _erro(f"arquivo ausente ({caminho.name})") from None
    except (OSError, UnicodeDecodeError) as erro:
        raise _erro(f"nao foi possivel ler {caminho.name}: {erro}") from None
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise _erro(f"JSON invalido em {caminho.name}: {erro}") from None
    _validar(dados)
    return Questionario(dados=dados)
