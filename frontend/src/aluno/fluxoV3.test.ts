import { describe, expect, it } from 'vitest';
import { questionarioV3 as q } from '../test/questionarioV3';
import { limparRespostasV3, montarEnvioV3, perguntasVisiveisV3 } from './fluxoV3';

describe('Alcance v3', () => {
  it('une categorias e perguntas comuns sem duplicar perguntas compartilhadas', () => {
    const ids = perguntasVisiveisV3(q, ['chantagem', 'intimidade'], {});
    expect(ids).toEqual(expect.arrayContaining(['q-exigencia', 'q-circulacao', ...q.comuns]));
    expect(ids.filter(id => id === 'q-exigencia')).toHaveLength(1);
  });
  it('dinheiro abre perda; intimidade abre contato/adulto; trocar o gatilho limpa descendentes', () => {
    const dinheiro = { 'q-exigencia': ['q-exigencia.dinheiro'], 'q-perda': ['q-perda.dinheiro'] };
    expect(perguntasVisiveisV3(q, ['chantagem'], dinheiro)).toContain('q-perda');
    const intimo = { ...dinheiro, 'q-exigencia': ['q-exigencia.intimidade'] };
    expect(perguntasVisiveisV3(q, ['chantagem'], intimo)).toEqual(expect.arrayContaining(['q-contato-atual', 'q-adulto']));
    expect(limparRespostasV3(q, ['chantagem'], intimo)).not.toHaveProperty('q-perda');
    expect(limparRespostasV3(q, [], intimo)).not.toHaveProperty('q-exigencia');
  });
  it('raízes diretas são visíveis mesmo com mostrar_se e gatilhos invisíveis não abrem ramos', () => {
    expect(perguntasVisiveisV3(q, ['contato'], {})).toContain('q-adulto');
    expect(perguntasVisiveisV3(q, [], { 'q-exigencia': ['q-exigencia.intimidade'] })).not.toContain('q-adulto');
  });
  it('payload usa versão, somente opções válidas e respostas alcançáveis', () => {
    const payload = JSON.parse(montarEnvioV3(q, ['chantagem', 'inventada'], { 'q-exigencia': ['q-exigencia.dinheiro', 'invalida'], 'q-adulto': ['q-adulto.sim'] }));
    expect(payload).toEqual({ versao: 3, marcadas: ['chantagem'], respostas: { 'q-exigencia': ['q-exigencia.dinheiro'] } });
  });
});
