import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Pedido from './Pedido';

it('identifica o tema durante o desdobramento e permite pular para o relato', async () => {
  const definicao = { versao: 3, dimensoes: { alcance: 'Alcance' }, comuns: [],
    grupos: [{ id: 'internet', nome: 'Na internet', opcoes: [{ id: 'cyber', texto: 'Cyberbullying', perguntas: ['q-cyber-forma'] }] }],
    perguntas: [
      { id: 'q-cyber-forma', dimensao: 'alcance', texto: 'Como foram os ataques na internet?', tipo: 'unica', para_opcoes: ['cyber'], respostas: [{ id: 'q-cyber-forma.imagens', texto: 'Imagens ou montagens' }] },
      { id: 'q-cyber-imagens', dimensao: 'alcance', texto: 'O que aconteceu com essas imagens?', tipo: 'unica', para_opcoes: ['cyber'], mostrar_se: ['q-cyber-forma.imagens'], respostas: [{ id: 'q-cyber-imagens.publicadas', texto: 'Foram publicadas' }] },
    ] };
  vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify(url === '/api/v3/questionario' ? definicao : { revisao: 0, ambientes: [] })));
  const user = userEvent.setup(); render(<Pedido onEnviado={() => {}} />);
  await user.click(await screen.findByText('Na internet', { exact: false }));
  await user.click(screen.getByRole('checkbox', { name: 'Cyberbullying' }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByText('Sobre: Cyberbullying')).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Imagens ou montagens' }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.getByText('O que aconteceu com essas imagens?')).toHaveFocus();
  expect(screen.getByText('Sobre: Cyberbullying')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ir para o relato' }));
  expect(screen.getByLabelText('O que aconteceu?')).toBeVisible();
});
