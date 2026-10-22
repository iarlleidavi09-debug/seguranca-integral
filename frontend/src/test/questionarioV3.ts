import { readFileSync } from 'node:fs';
import type { QuestionarioV3 } from '../shared/v3';

const privado = JSON.parse(readFileSync('../backend/app/questionario_v3.json', 'utf8'));
export const questionarioV3: QuestionarioV3 = {
  versao: 3, dimensoes: privado.dimensoes, comuns: privado.comuns,
  grupos: privado.grupos.map((g: any) => ({ id: g.id, nome: g.nome, opcoes: g.opcoes.map((o: any) => ({ id: o.id, texto: o.texto, perguntas: o.perguntas })) })),
  perguntas: privado.perguntas.map((p: any) => ({ id: p.id, dimensao: p.dimensao, texto: p.texto, tipo: p.tipo,
    respostas: p.respostas.map((r: any) => ({ id: r.id, texto: r.texto })), ...(p.mostrar_se ? { mostrar_se: p.mostrar_se } : {}),
    ...(p.mostrar_se_todas ? { mostrar_se_todas: p.mostrar_se_todas } : {}), ...(p.para_opcoes ? { para_opcoes: p.para_opcoes } : {}) })),
};
