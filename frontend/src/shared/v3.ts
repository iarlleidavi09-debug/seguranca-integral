import type { Pergunta, Opcao } from './api';
export type GrupoV3 = { id: string; nome: string; opcoes: Opcao[] };
export type QuestionarioV3 = { versao: 3; grupos: GrupoV3[]; comuns: string[]; perguntas: Pergunta[]; dimensoes: Record<string, string> };
