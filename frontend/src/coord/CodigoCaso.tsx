import { useState } from 'react';
import { copiarTexto } from '../shared/copiarTexto';
import './codigo-caso.css';

export default function CodigoCaso({ codigo }: { codigo?: string | null }) {
  const [aviso, setAviso] = useState('');
  return <div className="caso-codigo" role="group" aria-label="Código de acompanhamento do caso">
    <div>
      <span className="caso-codigo-rotulo">Código de acompanhamento</span>
      {codigo ? <strong className="caso-codigo-valor">{codigo}</strong>
        : <span className="caso-codigo-indisponivel">Disponível após o próximo acesso do aluno com o código original.</span>}
    </div>
    {codigo && <button type="button" className="botao secundario" onClick={async () => {
      setAviso(await copiarTexto(codigo) ? 'Código copiado.' : 'Não foi possível copiar. Selecione o código e copie manualmente.');
    }}>Copiar código de acompanhamento</button>}
    {aviso && <p role="status" className="caso-codigo-aviso">{aviso}</p>}
  </div>;
}
