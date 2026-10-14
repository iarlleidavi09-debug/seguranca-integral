import { useState } from 'react';

export default function Inicio({ onAjuda, onAcompanhar }: { onAjuda: () => void; onAcompanhar: (codigo: string) => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  return <>
    <section className="abertura">
      <h1>Você pode pedir ajuda.</h1>
      <p>Se algo na internet está te preocupando, conte para a coordenação da escola. Você pode ficar anônimo.</p>
      <button className="botao principal ajuda" onClick={onAjuda}>Preciso de ajuda</button>
    </section>
    <section className="acompanhamento-inicio" aria-labelledby="titulo-acompanhar">
      <h2 id="titulo-acompanhar">Já pediu ajuda?</h2>
      <p>Use o código que recebeu para ver seu caso e conversar com a coordenação.</p>
      <form noValidate onSubmit={e => {
        e.preventDefault();
        if (!codigo.trim()) { setErro('Digite seu código para acompanhar.'); return; }
        onAcompanhar(codigo);
      }}>
        <label htmlFor="codigo-inicio">Acompanhar meu caso</label>
        <div className="campo-acao">
          <input id="codigo-inicio" value={codigo} onChange={e => { setCodigo(e.target.value); setErro(''); }} placeholder="Seu código de acompanhamento" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="ajuda-codigo" />
          <button className="botao secundario">Acompanhar</button>
        </div>
        <p id="ajuda-codigo" className="texto-pequeno">Pode usar letras minúsculas, espaços ou digitar sem hífen.</p>
        {erro && <p role="alert" className="erro">{erro}</p>}
      </form>
    </section>
    <aside className="aviso consentimento" aria-labelledby="titulo-dados">
      <h2 id="titulo-dados">Antes de contar</h2>
      <p>Ao enviar, a escola guarda seu relato, as imagens e as mensagens para cuidar do caso. Seu nome e sua turma só são enviados se você escolher se identificar.</p>
      <p>O texto do rascunho fica neste navegador até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.</p>
    </aside>
  </>;
}
