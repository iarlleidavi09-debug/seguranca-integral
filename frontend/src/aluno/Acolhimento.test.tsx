import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import Acolhimento from './Acolhimento';
import { lerAcessos } from './acessos';
beforeEach(() => localStorage.clear());
it('envia apenas texto e recibo e mantém recibo ao tentar novamente', async () => {
 const user = userEvent.setup(); const criado = vi.fn();
 vi.mocked(fetch).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(new Response(JSON.stringify({codigo:'K7M2-9QXD'}),{status:201}));
 render(<Acolhimento onCriado={criado} onEnviando={() => {}} />);
 expect(screen.queryByLabelText(/nome|ano|turma/i)).not.toBeInTheDocument();
 await user.type(screen.getByLabelText('Sua primeira mensagem'), 'Quero conversar');
 await user.click(screen.getByRole('button', {name:'Iniciar conversa anônima'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Confira sua conexão');
 const primeiro = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
 expect(primeiro).toEqual({texto:'Quero conversar',envio_id:expect.stringMatching(/^[a-f0-9]{32}$/)});
 await user.click(screen.getByRole('button', {name:'Iniciar conversa anônima'}));
 await waitFor(() => expect(criado).toHaveBeenCalledWith('K7M2-9QXD'));
 expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual(primeiro);
 expect(lerAcessos()).toEqual([{codigo:'K7M2-9QXD',lastRead:0}]);
});

it('avisa que a rede da escola pode registrar os horários de acesso', () => {
 render(<Acolhimento onCriado={() => {}} onEnviando={() => {}} />);
 expect(screen.getByText(/rede escolar pode registrar os horários de acesso/)).toHaveClass('texto-pequeno');
});
