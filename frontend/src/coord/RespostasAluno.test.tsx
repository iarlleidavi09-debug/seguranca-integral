import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RespostasAluno from './RespostasAluno';
import type { QuestionarioCaso } from '../shared/api';

const q = (extra: Partial<QuestionarioCaso> = {}): QuestionarioCaso => ({
  situacao: { id: 'ameacas', nome: 'Ameaças' },
  marcadas: ['Recebi mensagens', 'Fui seguido'],
  dimensoes: [
    { id: 'quando', rotulo: 'Quando aconteceu', itens: [{ pergunta: 'Foi recente?', respostas: ['Hoje'] }] },
    { id: 'frequencia', rotulo: 'Com que frequência', itens: [{ pergunta: 'Acontece sempre?', respostas: ['Toda semana', 'Quase todo dia'] }] },
  ],
  ...extra,
});

describe('RespostasAluno', () => {
  it('sem questionário mostra a mensagem', () => {
    render(<RespostasAluno questionario={null} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Respostas do aluno' })).toBeInTheDocument();
    expect(screen.getByText('O aluno não respondeu ao questionário.')).toBeInTheDocument();
  });

  it('mostra título, situação, opções marcadas e um grupo por dimensão na ordem recebida', () => {
    render(<RespostasAluno questionario={q()} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Respostas do aluno' })).toBeInTheDocument();
    expect(screen.getByText('Situação: Ameaças')).toBeInTheDocument();
    const opcoes = screen.getByRole('list', { name: 'Opções marcadas' });
    expect(within(opcoes).getAllByRole('listitem').map(i => i.textContent)).toEqual(['Recebi mensagens', 'Fui seguido']);
    expect(screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Quando aconteceu', 'Com que frequência']);
  });

  it('pergunta em dt e cada resposta em um dd', () => {
    const { container } = render(<RespostasAluno questionario={q()} />);
    const dls = container.querySelectorAll('dl');
    expect(dls).toHaveLength(2);
    expect(dls[1].querySelector('dt')?.textContent).toBe('Acontece sempre?');
    expect(Array.from(dls[1].querySelectorAll('dd')).map(d => d.textContent)).toEqual(['Toda semana', 'Quase todo dia']);
  });

  it('dimensão sem itens não aparece', () => {
    render(<RespostasAluno questionario={q({ dimensoes: [{ id: 'quando', rotulo: 'Quando aconteceu', itens: [] }, { id: 'risco', rotulo: 'Risco', itens: [{ pergunta: 'P?', respostas: ['R'] }] }] })} />);
    expect(screen.queryByRole('heading', { level: 4, name: 'Quando aconteceu' })).toBeNull();
    expect(screen.getByRole('heading', { level: 4, name: 'Risco' })).toBeInTheDocument();
  });

  it('mostra HTML como texto literal', () => {
    const { container } = render(<RespostasAluno questionario={q({
      situacao: { id: 's', nome: '<b>x</b>' }, marcadas: ['<script>alert(1)</script>'],
      dimensoes: [{ id: 'quando', rotulo: '<b>x</b>', itens: [{ pergunta: '<b>x</b>', respostas: ['<script>y</script>'] }] }],
    })} />);
    expect(container.querySelector('b, script')).toBeNull();
    expect(screen.getByText('Situação: <b>x</b>')).toBeInTheDocument();
    expect(screen.getByText('<script>y</script>')).toBeInTheDocument();
  });

  it('id desconhecido aparece como veio', () => {
    render(<RespostasAluno questionario={q({ situacao: { id: 'antiga', nome: 'antiga' }, marcadas: ['opcao_removida'] })} />);
    expect(screen.getByText('Situação: antiga')).toBeInTheDocument();
    expect(screen.getByText('opcao_removida')).toBeInTheDocument();
  });
});
