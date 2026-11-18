import type { DadosAtendimento } from '../shared/api';
import { limparRascunhosConversa } from './rascunhosConversa';

type Rascunho = { dados: DadosAtendimento; revisao: number };
const rascunhos = new Map<number, Rascunho>();
export const obterRascunhoAtendimento = (id: number) => rascunhos.get(id);
export const guardarRascunhoAtendimento = (id: number, dados: DadosAtendimento, revisao: number) => rascunhos.set(id, { dados, revisao });
export const removerRascunhoAtendimento = (id: number) => rascunhos.delete(id);
export const limparRascunhosAtendimento = () => { rascunhos.clear(); limparRascunhosConversa(); };
