import { useState } from 'react';

function Simbolo({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export default function Inicio({ onAjuda, onAcompanhar }: { onAjuda: () => void; onAcompanhar: (codigo: string) => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  return <>
    <section className="boas-vindas">
      <div className="abertura">
        <h1>Você não precisa lidar com isso <em>sozinho.</em></h1>
        <p>Se algo na internet está te preocupando, conte para a coordenação da escola. Vamos por partes, no seu tempo, e você pode ficar anônimo.</p>
        <button className="botao principal ajuda" onClick={onAjuda}>Preciso de ajuda</button>
      </div>
      <aside className="bilhete">
        <span className="bilhete-simbolo"><Simbolo><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" /></Simbolo></span>
        <h2>Não precisa ter as palavras certas.</h2>
        <p>Comece contando só o que conseguir. A coordenação lê seu pedido e conversa com você por aqui.</p>
        <p className="bilhete-assinatura">Um passo de cada vez.</p>
      </aside>
    </section>
    <section className="acompanhamento-inicio" aria-labelledby="titulo-acompanhar">
      <h2 id="titulo-acompanhar">Já conversou com a gente?</h2>
      <p>Use o código que você recebeu para ver seu caso e continuar a conversa com a coordenação.</p>
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
      <p>Para anonimato total, use dados móveis (4G), não o Wi-Fi da escola; o horário do envio pode ser cruzado com os registros de rede da escola.</p>
      <p>O texto do rascunho fica neste navegador por até 24 horas ou até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.</p>
    </aside>
  </>;
}
