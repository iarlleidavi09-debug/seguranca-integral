"""Questionário v3: definição capturada, alcance e triagem por dimensões."""
from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .questionario import QuestionarioInvalido, RespostasInvalidas
from .triage import Triagem, classificar as classificar_texto

DIMENSOES = ('quando', 'frequencia', 'alcance', 'consequencias', 'risco')
TETOS = {'quando': 2, 'frequencia': 2, 'alcance': 1, 'consequencias': 2, 'risco': 3}
TIPOS_LEGADOS = ('cyberbullying', 'ameaca', 'vazamento', 'golpe', 'perfil_falso', 'aliciamento', 'outro')
MAX_BYTES_RESPOSTAS = 65536
MAX_IDS = 400
ID = re.compile(r'[a-z0-9][a-z0-9_.-]{0,79}')


@dataclass(frozen=True)
class QuestionarioV3:
    dados: dict

    @property
    def opcoes(self):
        return {o['id']: o for g in self.dados['grupos'] for o in g['opcoes']}

    @property
    def perguntas(self):
        return {p['id']: p for p in self.dados['perguntas']}

    def para_aluno(self) -> dict:
        return {'versao': 3, 'dimensoes': copy.deepcopy(self.dados['dimensoes']),
                'comuns': list(self.dados['comuns']),
                'grupos': [{'id': g['id'], 'nome': g['nome'],
                            'opcoes': [{'id': o['id'], 'texto': o['texto'], 'perguntas': list(o['perguntas'])}
                                       for o in g['opcoes']]} for g in self.dados['grupos']],
                'perguntas': [{**{key: copy.deepcopy(p[key]) for key in ('id', 'dimensao', 'texto', 'tipo')},
                               'respostas': [{'id': r['id'], 'texto': r['texto']} for r in p['respostas']],
                               **{key: list(p[key]) for key in ('mostrar_se', 'mostrar_se_todas', 'para_opcoes') if key in p}}
                              for p in self.dados['perguntas']]}

    def visiveis(self, marcadas, respostas) -> list[str]:
        questions = self.perguntas
        chosen = set(marcadas)
        def in_scope(question):
            return 'para_opcoes' not in question or bool(chosen.intersection(question['para_opcoes']))
        roots = set(self.dados['comuns'])
        for oid in marcadas:
            if oid in self.opcoes:
                roots.update(self.opcoes[oid]['perguntas'])
        visible = {pid for pid in roots if in_scope(questions[pid])}
        # Só respostas de perguntas já alcançadas podem abrir descendentes.
        while True:
            selected = {r['id'] for pid in visible for r in questions[pid]['respostas']
                        if r['id'] in respostas.get(pid, [])}
            expanded = visible | {p['id'] for p in self.dados['perguntas']
                                  if in_scope(p)
                                  and (p.get('mostrar_se') or p.get('mostrar_se_todas'))
                                  and (not p.get('mostrar_se') or selected.intersection(p['mostrar_se']))
                                  and set(p.get('mostrar_se_todas', [])) <= selected}
            if expanded == visible:
                break
            visible = expanded
        ordered = self.dados['comuns'] + [p['id'] for p in self.dados['perguntas']
                                         if p['id'] not in self.dados['comuns']]
        return [pid for pid in ordered if pid in visible]

    def validar_respostas(self, bruto: str | None) -> dict | None:
        if bruto is None or not bruto.strip():
            return None
        if len(bruto.encode('utf-8')) > MAX_BYTES_RESPOSTAS:
            raise RespostasInvalidas('respostas grandes demais')
        try:
            data = json.loads(bruto)
        except (ValueError, RecursionError):
            raise RespostasInvalidas('JSON invalido') from None
        if not isinstance(data, dict) or type(data.get('versao')) is not int or data['versao'] != 3:
            raise RespostasInvalidas('versao invalida')
        selected, answers = data.get('marcadas'), data.get('respostas')
        if not isinstance(selected, list) or not isinstance(answers, dict):
            raise RespostasInvalidas('formato invalido')
        if (len(selected) > MAX_IDS or len(answers) > MAX_IDS
                or any(not isinstance(i, str) for i in selected)
                or len(set(selected)) != len(selected)
                or any(i not in self.opcoes for i in selected)):
            raise RespostasInvalidas('opcoes invalidas')
        total = len(selected)
        for pid, ids in answers.items():
            if pid not in self.perguntas or not isinstance(ids, list):
                raise RespostasInvalidas('pergunta invalida')
            total += len(ids)
            question = self.perguntas[pid]
            allowed = {r['id'] for r in question['respostas']}
            if (total > MAX_IDS or any(not isinstance(i, str) for i in ids)
                    or len(set(ids)) != len(ids) or any(i not in allowed for i in ids)
                    or (question['tipo'] == 'unica' and len(ids) > 1)):
                raise RespostasInvalidas('alternativas invalidas')
        reachable = set(self.visiveis(selected, answers))
        if set(answers) - reachable:
            raise RespostasInvalidas('pergunta fora do percurso')
        # Ordem canônica também torna a deduplicação independente da ordem do cliente.
        return {'versao': 3, 'marcadas': [i for i in self.opcoes if i in selected],
                'respostas': {pid: [r['id'] for r in p['respostas'] if r['id'] in answers[pid]]
                              for pid, p in self.perguntas.items() if answers.get(pid)}}

    def tipo_legado(self, respostas) -> str:
        selected = set((respostas or {}).get('marcadas', []))
        options = [o for oid, o in self.opcoes.items() if oid in selected]
        return max(options, key=lambda o: o['peso'])['tipo_legado'] if options else 'outro'

    def classificar(self, respostas, relato, em_andamento, termos) -> Triagem:
        if respostas is None:
            return classificar_texto('outro', relato, em_andamento, termos)
        selected = set(respostas['marcadas'])
        options = [o for oid, o in self.opcoes.items() if oid in selected]
        base = max(options, key=lambda o: o['peso']) if options else None
        points = base['peso'] if base else 1
        reasons = [f"base: {base['texto']} ({points})" if base else 'base: relato livre (1)']
        ids = {rid for values in respostas['respostas'].values() for rid in values}
        for dim in DIMENSOES:
            candidates = [r for p in self.dados['perguntas'] if p['dimensao'] == dim
                          for r in p['respostas'] if r['id'] in ids]
            highest = max(candidates, key=lambda r: r['peso'], default=None)
            if highest and highest['peso']:
                points += highest['peso']
                reasons.append(f"{dim}: {highest['texto']} (+{highest['peso']})")
        present = ids | selected
        alerts = [a['motivo'] for a in self.dados['alertas']
                  if set(a['todas']) <= present
                  and (not a.get('qualquer') or present.intersection(a['qualquer']))]
        textual = classificar_texto(self.tipo_legado(respostas), relato, em_andamento, termos)
        alerts.extend(m for m in textual.motivos if m.startswith('alerta:'))
        thresholds = self.dados['faixas']
        priority = 'alta' if points >= thresholds['alta'] else 'media' if points >= thresholds['media'] else 'baixa'
        if alerts:
            priority = 'critica'
            reasons.extend(dict.fromkeys(alerts))
        return Triagem(priority, points, tuple(reasons))

    def snapshot(self, respostas) -> dict:
        selected = set(respostas['marcadas'])
        groups = [g for g in self.dados['grupos'] if any(o['id'] in selected for o in g['opcoes'])]
        dimensions = []
        for dim in DIMENSOES:
            items = []
            for p in self.dados['perguntas']:
                values = respostas['respostas'].get(p['id'], [])
                if p['dimensao'] == dim and values:
                    items.append({'pergunta': p['texto'], 'respostas': [r['texto'] for r in p['respostas'] if r['id'] in values]})
            if items:
                dimensions.append({'id': dim, 'rotulo': self.dados['dimensoes'][dim], 'itens': items})
        return {'versao': 3, 'definicao': copy.deepcopy(self.dados),
                'respostas': copy.deepcopy(respostas),
                'categorias': [g['id'] for g in groups], 'opcoes': list(respostas['marcadas']),
                'descricao': {'situacao': {'id': 'v3', 'nome': ', '.join(g['nome'] for g in groups) or 'Relato livre'},
                              'marcadas': [o['texto'] for oid, o in self.opcoes.items() if oid in selected],
                              'dimensoes': dimensions}}


def _validar(data):
    def require(ok, message):
        if not ok:
            raise QuestionarioInvalido(message)
    require(isinstance(data, dict) and data.get('versao') == 3, 'versao invalida')
    require(isinstance(data.get('dimensoes'), dict) and set(data['dimensoes']) == set(DIMENSOES), 'dimensoes invalidas')
    groups, questions = data.get('grupos'), data.get('perguntas')
    require(isinstance(groups, list) and 1 <= len(groups) <= 20, 'grupos invalidos')
    require(isinstance(questions, list) and 1 <= len(questions) <= 200, 'perguntas invalidas')
    seen = set()
    def identity(item, label):
        require(isinstance(item, dict), label)
        oid = item.get('id')
        require(isinstance(oid, str) and ID.fullmatch(oid) and oid not in seen, 'id invalido ou repetido')
        seen.add(oid)
    def text(value):
        require(isinstance(value, str) and 0 < len(value.strip()) <= 500, 'texto invalido')
    for label in data['dimensoes'].values():
        text(label)
    def refs(values, allowed):
        require(isinstance(values, list) and all(isinstance(i, str) and i in allowed for i in values)
                and len(set(values)) == len(values), 'referencia invalida')
    question_ids, owner, options = set(), {}, []
    for group in groups:
        identity(group, 'grupo invalido')
        text(group.get('nome'))
        require(isinstance(group.get('opcoes'), list) and 1 <= len(group['opcoes']) <= 100, 'opcoes invalidas')
        for option in group['opcoes']:
            identity(option, 'opcao invalida')
            text(option.get('texto'))
            require(type(option.get('peso')) is int and 1 <= option['peso'] <= 5, 'peso-base invalido')
            require(option.get('tipo_legado') in TIPOS_LEGADOS, 'tipo legado invalido')
            options.append(option)
    for question in questions:
        identity(question, 'pergunta invalida')
        question_ids.add(question['id'])
        text(question.get('texto'))
        require(question.get('dimensao') in DIMENSOES, 'dimensao invalida')
        require(question.get('tipo') in ('unica', 'multipla'), 'tipo de pergunta invalido')
        require(isinstance(question.get('respostas'), list) and 1 <= len(question['respostas']) <= 30, 'respostas invalidas')
        for answer in question['respostas']:
            identity(answer, 'resposta invalida')
            text(answer.get('texto'))
            require(type(answer.get('peso')) is int and 0 <= answer['peso'] <= TETOS[question['dimensao']], 'peso de resposta invalido')
            owner[answer['id']] = question['id']
    refs(data.get('comuns'), question_ids)
    for option in options:
        refs(option.get('perguntas'), question_ids)
    edges = {}
    for question in questions:
        refs(question.get('mostrar_se', []), owner)
        refs(question.get('mostrar_se_todas', []), owner)
        if 'para_opcoes' in question:
            refs(question['para_opcoes'], {o['id'] for o in options})
            require(bool(question['para_opcoes']), 'escopo vazio')
        edges[question['id']] = [owner[r] for key in ('mostrar_se', 'mostrar_se_todas')
                                 for r in question.get(key, [])]
    done, active = set(), set()
    def visit(pid):
        require(pid not in active, 'ciclo em mostrar_se')
        if pid in done:
            return
        active.add(pid)
        for parent in edges[pid]:
            visit(parent)
        active.remove(pid)
        done.add(pid)
    for pid in question_ids:
        visit(pid)
    require(isinstance(data.get('alertas'), list) and len(data['alertas']) <= 50, 'alertas invalidos')
    allowed = set(owner) | {o['id'] for o in options}
    for alert in data['alertas']:
        require(isinstance(alert, dict), 'alerta invalido')
        text(alert.get('motivo'))
        refs(alert.get('todas'), allowed)
        refs(alert.get('qualquer', []), allowed)
        require(bool(alert['todas']), 'alerta vazio')
    thresholds = data.get('faixas')
    require(isinstance(thresholds, dict) and type(thresholds.get('media')) is int
            and type(thresholds.get('alta')) is int and 1 <= thresholds['media'] < thresholds['alta'] <= 15, 'faixas invalidas')


def carregar(path: Path) -> QuestionarioV3:
    try:
        if Path(path).stat().st_size > 256 * 1024:
            raise QuestionarioInvalido('definicao grande demais')
        data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
        _validar(data)
    except QuestionarioInvalido:
        raise
    except (OSError, ValueError, TypeError, KeyError, RecursionError, AttributeError) as exc:
        raise QuestionarioInvalido('definicao v3 invalida') from exc
    return QuestionarioV3(data)


# Projeção fixa para v2: nenhum relato antigo é reinterpretado.
LEGADOS = {'cyberbullying': ('humilhacao', 'cyber'), 'ameaca': ('ameacas', 'ameaca'),
           'vazamento': ('privacidade', 'dados'), 'golpe': ('privacidade', 'golpe'),
           'perfil_falso': ('privacidade', 'perfil'), 'aliciamento': ('sexual', 'aliciamento')}


def projetar(tipo, snapshot_json):
    if snapshot_json:
        snapshot = json.loads(snapshot_json)
        return snapshot['categorias'], snapshot['opcoes']
    mapped = LEGADOS.get(tipo)
    return ([mapped[0]], [mapped[1]]) if mapped else ([], [])
