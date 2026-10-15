import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Confirmacao from './Confirmacao';

describe('Confirmação', () => {
  it('acolhe, mostra o código em destaque e avisa que ele só aparece aqui', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Você deu o primeiro passo.' })).toBeInTheDocument();
    expect(screen.getByText('K7M2-9QXD')).toHaveClass('codigo');
    expect(screen.getByText(/Ele só aparece nesta confirmação/)).toBeInTheDocument();
  });
  it('copia o código e avisa em role=status; avisa também quando a cópia falha', async () => {
    const user = userEvent.setup();
    const gravar = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('negado'));
    vi.stubGlobal('navigator', { clipboard: { writeText: gravar } });
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(gravar).toHaveBeenCalledWith('K7M2-9QXD');
    expect(await screen.findByText(/Código copiado/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Código copiado');
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível copiar');
  });
  it('lista as imagens recusadas em role=alert', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD', anexos_recusados: [{ nome: 'a.png', motivo: 'tipo inválido' }] }} onAcompanhar={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('a.png: tipo inválido');
  });
  it('não mostra o alerta sem imagens recusadas', () => {
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('"Acompanhar meu caso" chama onAcompanhar', async () => {
    const user = userEvent.setup();
    const aoAcompanhar = vi.fn();
    render(<Confirmacao resultado={{ codigo: 'K7M2-9QXD' }} onAcompanhar={aoAcompanhar} />);
    await user.click(screen.getByRole('button', { name: 'Acompanhar meu caso' }));
    expect(aoAcompanhar).toHaveBeenCalledTimes(1);
  });
});
