import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CodigoCaso from './CodigoCaso';

afterEach(() => { vi.unstubAllGlobals(); });

it('exibe o código do caso e permite copiá-lo', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<CodigoCaso codigo="K7M2-9QXD" />);
  expect(screen.getByText('K7M2-9QXD')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Copiar código de acompanhamento' }));
  expect(await screen.findByText('Código copiado.')).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith('K7M2-9QXD');
});

it('explica a indisponibilidade de um caso antigo sem exibir um código fictício', () => {
  render(<CodigoCaso codigo={null} />);
  expect(screen.getByText(/Disponível após o próximo acesso do aluno/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Copiar/ })).toBeNull();
});
