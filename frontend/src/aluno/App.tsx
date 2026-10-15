import { useEffect, useRef, useState } from 'react';
import type { ResultadoDenuncia } from '../shared/api';
import Inicio from './Inicio';
import Denuncia from './Denuncia';
import Confirmacao from './Confirmacao';
import Acompanhar from './Acompanhar';

type Tela = { nome: 'inicio' } | { nome: 'denuncia' } | { nome: 'confirmacao'; resultado: ResultadoDenuncia } | { nome: 'acompanhar'; codigo: string };

export default function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'inicio' });
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  const main = useRef<HTMLElement>(null);
  const telaAnterior = useRef(tela);
  const inicio = () => setTela({ nome: 'inicio' });
  useEffect(() => {
    // a denúncia foca o próprio título a cada passo; o main não pode tomar o foco dela
    if (telaAnterior.current !== tela && tela.nome !== 'denuncia') main.current?.focus();
    telaAnterior.current = tela;
  }, [tela]);
  const atual = tela.nome === 'inicio' ? 'inicio' : tela.nome === 'acompanhar' ? 'acompanhar' : 'pedir';
  const item = (nome: string, destino: string, ir: () => void) => (
    <button type="button" disabled={enviandoDenuncia} aria-current={atual === destino ? 'page' : undefined} onClick={ir}>{nome}</button>
  );
  return <div className="aluno-app">
    <a className="pular" href="#conteudo" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Pular para o conteúdo</a>
    <header className="cabecalho"><div className="cabecalho-conteudo">
      <button type="button" className="marca" disabled={enviandoDenuncia} onClick={inicio}>
        <span className="marca-simbolo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
        </span>
        Segurança Integral
      </button>
      <nav className="navegacao" aria-label="Principal">
        {item('Início', 'inicio', inicio)}
        {item('Pedir ajuda', 'pedir', () => setTela({ nome: 'denuncia' }))}
        {item('Acompanhar', 'acompanhar', () => setTela({ nome: 'acompanhar', codigo: '' }))}
      </nav>
    </div></header>
    <main id="conteudo" ref={main} tabIndex={-1} className="portal">
      {tela.nome !== 'inicio' && <button type="button" className="botao-texto" disabled={enviandoDenuncia} onClick={inicio}>Voltar ao início</button>}
      {tela.nome === 'inicio' && <Inicio onAjuda={() => setTela({ nome: 'denuncia' })} onAcompanhar={codigo => setTela({ nome: 'acompanhar', codigo })} />}
      {tela.nome === 'denuncia' && <Denuncia onEnviando={setEnviandoDenuncia} onEnviado={resultado => setTela({ nome: 'confirmacao', resultado })} />}
      {tela.nome === 'confirmacao' && <Confirmacao resultado={tela.resultado} onAcompanhar={() => setTela({ nome: 'acompanhar', codigo: tela.resultado.codigo })} />}
      {tela.nome === 'acompanhar' && <Acompanhar codigoInicial={tela.codigo} />}
    </main>
    <footer className="rodape">Um canal da escola para ouvir e cuidar.</footer>
  </div>;
}
