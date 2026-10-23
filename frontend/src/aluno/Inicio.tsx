import { useState } from 'react';
import { lerAcessos, removerAcesso } from './acessos';

function Simbolo({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export default function Inicio({ onAjuda, onAcompanhar, onAcolhimento }: { onAjuda: () => void; onAcompanhar: (codigo: string) => void; onAcolhimento?: () => void }) {
  const [acessos, setAcessos] = useState(lerAcessos);
  const [avisoStorage, setAvisoStorage] = useState('');
  const remover = (codigo?: string) => { if (!removerAcesso(codigo)) setAvisoStorage('Não foi possível apagar os acessos neste navegador.'); else setAcessos(lerAcessos()); };
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  return <>
    {acessos.length > 0 && <section className="continuar-caso acompanhamento-inicio" aria-labelledby="acessos-salvos">
      <h2 id="acessos-salvos">Continuar meu caso</h2>
      <ul>{acessos.map(a => <li key={a.codigo}><button className="botao-texto" onClick={() => onAcompanhar(a.codigo)}>Abrir caso {a.codigo}</button> <button className="botao-texto" onClick={() => remover(a.codigo)}>Apagar acesso {a.codigo}</button></li>)}</ul>
      {acessos.length > 1 && <button className="botao secundario" onClick={() => remover()}>Apagar todos os acessos</button>}
      {avisoStorage && <p role="status">{avisoStorage}</p>}
    </section>}
    <section className="boas-vindas">
      <div className="abertura">
        <h1>Você não precisa lidar com isso <em>sozinho.</em></h1>
        <p>Se algo está te preocupando, na escola, na internet ou em casa, conte para a coordenação. No seu tempo e sem precisar dizer seu nome.</p>
      </div>
      <aside className="bilhete">
        <span className="bilhete-simbolo"><Simbolo><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" /></Simbolo></span>
        <h2>Não precisa ter as palavras certas.</h2>
        <p>Comece contando só o que conseguir. A coordenação lê seu pedido e conversa com você por aqui.</p>
        <p className="bilhete-assinatura">Um passo de cada vez.</p>
      </aside>
    </section>
    <div className="inicio-acoes">
      <section className="acao-cartao" aria-labelledby="acao-ajuda">
        <h2 id="acao-ajuda">Contar o que aconteceu</h2>
        <p>Escolha a situação, conte e envie.</p>
        <button className="botao principal" onClick={onAjuda}>Preciso de ajuda</button>
      </section>
      {onAcolhimento && <section className="acao-cartao" aria-labelledby="acao-conversa">
        <h2 id="acao-conversa">Só conversar</h2>
        <p>Sem questionário, nome, ano ou turma.</p>
        <button className="botao secundario" onClick={onAcolhimento}>Conversar sem me identificar</button>
      </section>}
      <section className="acao-cartao" aria-labelledby="acao-caso">
        <h2 id="acao-caso">Ver meu caso</h2>
        <form noValidate onSubmit={e => {
          e.preventDefault();
          if (!codigo.trim()) { setErro('Digite seu código para acompanhar.'); return; }
          onAcompanhar(codigo);
        }}>
          <label htmlFor="codigo-inicio">Código de acompanhamento</label>
          <div className="campo-acao">
            <input id="codigo-inicio" value={codigo} onChange={e => { setCodigo(e.target.value); setErro(''); }} placeholder="Seu código" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="ajuda-codigo" />
            <button className="botao secundario">Acompanhar</button>
          </div>
          <p id="ajuda-codigo" className="texto-pequeno">Pode usar letras minúsculas, espaços ou digitar sem hífen.</p>
          {erro && <p role="alert" className="erro">{erro}</p>}
        </form>
      </section>
    </div>
    <p className="privacidade-linha">A escola guarda o que você enviar para cuidar do caso. O nome é opcional.</p>
    <details className="recolhivel">
      <summary>Como funciona</summary>
      <h3>Para fazer uma denúncia</h3>
      <p>Toque em <strong>Preciso de ajuda</strong>, escolha a situação e conte o que aconteceu. Informe seu ano e sua sala, confira o relato e envie; o nome é opcional.</p>
      <h3>Para conversar sem questionário</h3>
      <p>Toque em <strong>Conversar sem me identificar</strong>, escreva sua primeira mensagem e envie. Você não precisa informar nome, ano ou turma.</p>
      <h3>Para acompanhar e ver respostas</h3>
      <p>Digite o código recebido em <strong>Ver meu caso</strong> ou abra um caso salvo. Respostas ainda não vistas aparecem como <strong>Mensagem nova</strong>.</p>
      <h3>Para voltar ao seu caso depois</h3>
      <p>Os acessos ficam salvos neste navegador; em outro aparelho, use o código. Em aparelho compartilhado, use <strong>Apagar acesso</strong> ao terminar: o caso continua guardado na escola.</p>
    </details>
    <details className="recolhivel">
      <summary>Seus dados e privacidade</summary>
      <p>Ao enviar, a escola guarda seu relato, as imagens e as mensagens para cuidar do caso. Seu nome é opcional. Na denúncia, ano e sala são obrigatórios; no acolhimento anônimo, não pedimos nome, ano ou turma.</p>
      <p>Este canal funciona na rede local da escola. Mesmo sem informar seu nome, horários de acesso podem aparecer nos registros da rede.</p>
      <p>O texto do rascunho fica neste navegador por até 24 horas ou até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.</p>
    </details>
  </>;
}
