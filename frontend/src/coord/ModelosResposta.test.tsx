import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelosResposta from './ModelosResposta';
import { TEXTO_MAX } from './Conversa';

describe('Modelos de resposta', () => {
  it('permite escolher e editar a prévia antes de inserir, sem enviar automaticamente', () => {
    const inserir = vi.fn();
    render(<ModelosResposta textoAtual="" aoInserir={inserir} />);
    fireEvent.click(screen.getByText('Modelos de resposta'));
    fireEvent.change(screen.getByLabelText('Modelo de resposta'), { target: { value: 'acolhimento' } });
    expect((screen.getByLabelText('Prévia do modelo') as HTMLTextAreaElement).value).toContain('Obrigado por compartilhar');
    expect(inserir).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Prévia do modelo'), { target: { value: 'Vamos conversar com calma.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no rascunho' }));
    expect(inserir).toHaveBeenCalledExactlyOnceWith('Vamos conversar com calma.');
  });

  it('acrescenta o modelo ao texto existente e mantém ambos editáveis', () => {
    function Editor() {
      const [texto, setTexto] = useState('Texto que já estava escrito.');
      return <><ModelosResposta textoAtual={texto} aoInserir={setTexto} /><textarea aria-label="Mensagem" value={texto} onChange={e => setTexto(e.target.value)} /></>;
    }
    render(<Editor />);
    fireEvent.click(screen.getByText('Modelos de resposta'));
    fireEvent.change(screen.getByLabelText('Modelo de resposta'), { target: { value: 'informacoes' } });
    const previa = (screen.getByLabelText('Prévia do modelo') as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar ao rascunho' }));
    expect(screen.getByLabelText('Mensagem')).toHaveValue(`Texto que já estava escrito.\n\n${previa}`);
    expect(screen.getByRole('status')).toHaveTextContent('Modelo acrescentado ao rascunho. Revise antes de enviar.');
  });

  it('não corta texto quando o modelo ultrapassaria o limite da mensagem', () => {
    const inserir = vi.fn();
    render(<ModelosResposta textoAtual={'x'.repeat(TEXTO_MAX - 1)} aoInserir={inserir} />);
    fireEvent.click(screen.getByText('Modelos de resposta'));
    fireEvent.change(screen.getByLabelText('Modelo de resposta'), { target: { value: 'acompanhamento' } });
    expect(screen.getByRole('button', { name: 'Acrescentar ao rascunho' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('O texto com o modelo ultrapassa');
    expect(inserir).not.toHaveBeenCalled();
  });
});
