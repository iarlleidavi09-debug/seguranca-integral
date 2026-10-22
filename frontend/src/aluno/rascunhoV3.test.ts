import { describe, expect, it, vi } from 'vitest';
import { apagarRascunhoV3, lerRascunhoV3, salvarRascunhoV3, vazioV3 } from './rascunhoV3';

const chave = 'si-aluno-pedido-v3';
describe('Rascunho do pedido v3', () => {
  it('preserva mais de 150 respostas válidas no catálogo ampliado', () => {
    const respostas = Object.fromEntries(Array.from({ length: 180 }, (_, i) => [`q-tema-${i}`, [`q-tema-${i}.sim`]]));
    salvarRascunhoV3({ ...vazioV3, respostas });
    expect(Object.keys(lerRascunhoV3().dados!.respostas)).toHaveLength(180);
  });
  it('preserva IDs personalizados válidos com ponto e sublinhado, sem exigir prefixo q-', () => {
    salvarRascunhoV3({ ...vazioV3, marcadas: ['tema_personalizado'], respostas: { 'situacao.atual': ['situacao.atual.nao_sei'] } });
    expect(lerRascunhoV3().dados).toMatchObject({ marcadas: ['tema_personalizado'], respostas: { 'situacao.atual': ['situacao.atual.nao_sei'] } });
  });
  it('usa chave distinta, allowlist e 24h sem renovar ao ler', () => {
    salvarRascunhoV3({ ...vazioV3, relato: 'Texto guardado', codigo: 'SEGREDO', imagens: ['blob:imagem'], conversa: ['privada'] } as any, 1000);
    const bruto = localStorage.getItem(chave)!;
    expect(bruto).not.toBeNull();
    expect(bruto).not.toMatch(/SEGREDO|blob:imagem|privada|codigo|imagens|conversa/);
    expect(lerRascunhoV3(2000).dados?.relato).toBe('Texto guardado');
    expect(localStorage.getItem(chave)).toBe(bruto);
    expect(lerRascunhoV3(1000 + 86400001).dados).toBeNull();
    expect(localStorage.getItem(chave)).toBeNull();
  });
  it('descarta legado com aviso e não restaura sua identidade', () => {
    localStorage.setItem('si-aluno-rascunho-v3', '{"nome":"antigo"}');
    const resultado = lerRascunhoV3();
    expect(resultado.dados).toBeNull();
    expect(resultado.aviso).toMatch(/antigo/);
    expect(localStorage.getItem('si-aluno-rascunho-v3')).toBeNull();
  });
  it('não lança com storage bloqueado e elimina identidade de anônimo', () => {
    salvarRascunhoV3({ ...vazioV3, nome: 'não guardar', turma: 'turma' });
    expect(lerRascunhoV3().dados?.nome).toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(salvarRascunhoV3(vazioV3)).toBe(false);
    expect(() => apagarRascunhoV3()).not.toThrow();
  });
});
