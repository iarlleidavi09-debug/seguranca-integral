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
    <section className="boas-vindas">
      <div className="abertura">
        <h1>Você não precisa lidar com isso <em>sozinho.</em></h1>
        <p>Se algo está te preocupando, na escola, na internet ou em casa, conte para a coordenação. Vamos por partes, no seu tempo. Você pode enviar sem informar seu nome.</p>
        <p>Para iniciar uma denúncia, toque em “Preciso de ajuda”. Escolha a situação, conte o que aconteceu e envie. No final, você receberá um código para conversar com a equipe.</p>
        <button className="botao principal ajuda" onClick={onAjuda}>Preciso de ajuda</button>
        {onAcolhimento && <p><button className="botao secundario" onClick={onAcolhimento}>Quero acolhimento anônimo</button><br />Converse sem questionário, nome, ano ou turma.</p>}
      </div>
      <aside className="bilhete">
        <span className="bilhete-simbolo"><Simbolo><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" /></Simbolo></span>
        <h2>Não precisa ter as palavras certas.</h2>
        <p>Comece contando só o que conseguir. A coordenação lê seu pedido e conversa com você por aqui.</p>
        <p className="bilhete-assinatura">Um passo de cada vez.</p>
      </aside>
    </section>
    <section className="acompanhamento-inicio" aria-labelledby="titulo-guia-uso">
      <h2 id="titulo-guia-uso">Como usar este canal</h2>
      <h3>Para fazer uma denúncia</h3>
      <p>Toque em <strong>Preciso de ajuda</strong>, escolha a situação e conte o que aconteceu. As perguntas sobre a situação são opcionais. Você pode enviar sem informar seu nome, mas precisa informar seu ano e sua sala. Confira o relato e toque no botão de envio. A confirmação avisa quando o pedido chegou à coordenação.</p>
      <h3>Para conversar sem questionário</h3>
      <p>Toque em <strong>Quero acolhimento anônimo</strong>, escreva sua primeira mensagem e envie. Você não precisa informar nome, ano ou turma. A conversa com a coordenação começa por ali.</p>
      <h3>Para acompanhar e ver respostas</h3>
      <p>Guarde o código recebido. Digite esse código em <strong>Acompanhar meu caso</strong> ou abra um caso salvo abaixo. Você vai direto para a conversa: respostas ainda não vistas aparecem como <strong>Mensagem nova</strong>. Para responder, escreva em <strong>Sua resposta</strong>, toque em <strong>Enviar resposta</strong> e aguarde a confirmação de envio.</p>
      <h3>Para voltar ao seu caso depois</h3>
      <p>Os acessos ficam em <strong>Casos salvos neste navegador</strong>. Toque em <strong>Abrir caso</strong> para continuar. Em outro aparelho ou navegador, use o código. Se o navegador não conseguir salvar, anote o código que aparece na conversa.</p>
      <p>Em um aparelho compartilhado, use <strong>Apagar acesso</strong> ou <strong>Apagar todos os acessos</strong> ao terminar. Isso remove o atalho deste navegador; seu caso continua guardado na escola.</p>
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
    <section className="acompanhamento-inicio" aria-labelledby="acessos-salvos"><h2 id="acessos-salvos">Casos salvos neste navegador</h2><p>Outras pessoas que usarem este navegador poderão reabrir seus casos. Em aparelhos compartilhados, apague os acessos ao terminar. Apagar o acesso não apaga o caso na escola.</p>{acessos.length ? <><ul>{acessos.map(a => <li key={a.codigo}><button className="botao-texto" onClick={() => onAcompanhar(a.codigo)}>Abrir caso {a.codigo}</button> <button className="botao-texto" onClick={() => remover(a.codigo)}>Apagar acesso {a.codigo}</button></li>)}</ul><button className="botao secundario" onClick={() => remover()}>Apagar todos os acessos</button></> : <p>Nenhum acesso salvo.</p>}{avisoStorage && <p role="status">{avisoStorage}</p>}</section>
    <aside className="aviso consentimento" aria-labelledby="titulo-dados">
      <h2 id="titulo-dados">Antes de contar</h2>
      <p>Ao enviar, a escola guarda seu relato, as imagens e as mensagens para cuidar do caso. Seu nome é opcional. Na denúncia, ano e sala são obrigatórios; no acolhimento anônimo, não pedimos nome, ano ou turma.</p>
      <p>Este canal funciona na rede local da escola. Mesmo sem informar seu nome, horários de acesso podem aparecer nos registros da rede.</p>
      <p>O texto do rascunho fica neste navegador por até 24 horas ou até o envio. As imagens não ficam no rascunho. Evite usar um aparelho compartilhado.</p>
    </aside>
  </>;
}
