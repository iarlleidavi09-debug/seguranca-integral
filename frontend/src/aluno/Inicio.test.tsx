import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Inicio from './Inicio';

describe('Início do aluno', () => {
  it('acolhe com o título e o bilhete', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Você não precisa lidar com isso sozinho.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Não precisa ter as palavras certas.' })).toBeInTheDocument();
  });
  it('"Preciso de ajuda" chama onAjuda', async () => {
    const user = userEvent.setup();
    const onAjuda = vi.fn();
    render(<Inicio onAjuda={onAjuda} onAcompanhar={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preciso de ajuda' }));
    expect(onAjuda).toHaveBeenCalledTimes(1);
  });
  it('acompanhar por código chama onAcompanhar e avisa quando vazio', async () => {
    const user = userEvent.setup();
    const onAcompanhar = vi.fn();
    render(<Inicio onAjuda={() => {}} onAcompanhar={onAcompanhar} />);
    expect(screen.getByRole('heading', { name: 'Já conversou com a gente?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu código para acompanhar.');
    expect(onAcompanhar).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Acompanhar meu caso'), 'k7m2 9qxd');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acompanhar' }));
    expect(onAcompanhar).toHaveBeenCalledWith('k7m2 9qxd');
  });
  it('o consentimento mantém o texto, avisa dos dados móveis e do prazo do rascunho', () => {
    render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    const bloco = screen.getByRole('complementary', { name: 'Antes de contar' });
    expect(bloco).toHaveTextContent('Ao enviar, a escola guarda seu relato, as imagens e as mensagens para cuidar do caso. Seu nome e sua turma só são enviados se você escolher se identificar.');
    expect(bloco).toHaveTextContent('Para anonimato total, use dados móveis (4G), não o Wi-Fi da escola; o horário do envio pode ser cruzado com os registros de rede da escola.');
    expect(bloco).toHaveTextContent('O texto do rascunho fica neste navegador por até 24 horas ou até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.');
  });
  it('não usa travessão longo', () => {
    const { container } = render(<Inicio onAjuda={() => {}} onAcompanhar={() => {}} />);
    expect(container.textContent).not.toMatch(/[—–]/);
  });
});
