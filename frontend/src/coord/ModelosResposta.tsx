import { useId, useState } from 'react';
import { TEXTO_MAX } from './Conversa';
import './modelos-resposta.css';

const modelos = [
  { id: 'acolhimento', nome: 'Acolhimento', texto: 'Obrigado por compartilhar o que aconteceu. Estamos aqui para ouvir você e pensar juntos nos próximos passos. Você pode nos contar o que precisa neste momento.' },
  { id: 'informacoes', nome: 'Pedido de informações', texto: 'Para entendermos melhor o que aconteceu, você pode contar quando e onde foi? Compartilhe apenas o que se sentir à vontade para dizer.' },
  { id: 'acompanhamento', nome: 'Acompanhamento', texto: 'Estamos acompanhando a situação. Como você está se sentindo? Aconteceu algo novo ou há algo em que possamos ajudar agora?' },
];

export default function ModelosResposta({ textoAtual, aoInserir, ocupado = false }: {
  textoAtual: string; aoInserir: (texto: string) => void; ocupado?: boolean;
}) {
  const prefixo = useId();
  const [modelo, setModelo] = useState('');
  const [previa, setPrevia] = useState('');
  const [aviso, setAviso] = useState('');
  const acrescentar = textoAtual.length > 0;
  const textoCompleto = acrescentar ? `${textoAtual}\n\n${previa}` : previa;
  const excede = textoCompleto.length > TEXTO_MAX;

  function inserir() {
    if (ocupado || !previa.trim() || excede) return;
    aoInserir(textoCompleto);
    setAviso(acrescentar ? 'Modelo acrescentado ao rascunho. Revise antes de enviar.' : 'Modelo inserido no rascunho. Revise antes de enviar.');
  }

  return <details className="modelos-resposta">
    <summary>Modelos de resposta</summary>
    <div className="modelos-resposta-corpo">
      <p className="ajuda">Escolha um ponto de partida e adapte a mensagem à situação do aluno.</p>
      <div>
        <label htmlFor={`${prefixo}-modelo`}>Modelo de resposta</label>
        <select id={`${prefixo}-modelo`} value={modelo} disabled={ocupado} onChange={e => {
          const id = e.target.value;
          setModelo(id); setPrevia(modelos.find(m => m.id === id)?.texto ?? ''); setAviso('');
        }}>
          <option value="">Escolha um modelo</option>
          {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>
      {modelo && <>
        <div>
          <label htmlFor={`${prefixo}-previa`}>Prévia do modelo</label>
          <textarea id={`${prefixo}-previa`} rows={4} maxLength={TEXTO_MAX} value={previa} disabled={ocupado}
            aria-describedby={`${prefixo}-ajuda`} onChange={e => { setPrevia(e.target.value); setAviso(''); }} />
          <p id={`${prefixo}-ajuda`} className="ajuda">{acrescentar ? 'O modelo será acrescentado ao final do texto que você já escreveu.' : 'O modelo será inserido no campo de mensagem para sua revisão.'}</p>
        </div>
        {excede && <p className="erro" role="alert">O texto com o modelo ultrapassa {TEXTO_MAX} caracteres. Encurte a prévia ou o rascunho antes de inserir.</p>}
        <button className="botao secundario" type="button" disabled={ocupado || !previa.trim() || excede} onClick={inserir}>
          {acrescentar ? 'Acrescentar ao rascunho' : 'Inserir no rascunho'}
        </button>
      </>}
      {aviso && <p className="ajuda" role="status">{aviso}</p>}
    </div>
  </details>;
}
