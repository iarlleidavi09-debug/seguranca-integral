import { useEffect, useRef, useState } from 'react';
import type { ResultadoDenuncia } from '../shared/api';
import Inicio from './Inicio';
import Acolhimento from './Acolhimento';
import { guardarAcesso } from './acessos';
import Pedido from './Pedido';
import type { ExtrasEnvioV3 as ExtrasEnvio } from './Pedido';
import Confirmacao from './Confirmacao';
import Acompanhar from './Acompanhar';

type Tela = { nome: 'acolhimento' } | { nome: 'inicio' } | { nome: 'denuncia' } | { nome: 'confirmacao'; resultado: ResultadoDenuncia; extras?: ExtrasEnvio } | { nome: 'acompanhar'; codigo: string; consulta: number };

export default function App() {
  const [tela, setTela] = useState<Tela>({ nome: 'inicio' });
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  const main = useRef<HTMLElement>(null);
  const telaAnterior = useRef(tela);
  // clicar na tela em que já está não troca de tela, então não refoca o main
  const ir = (nova: Tela) => setTela(atual => (atual.nome === nova.nome && nova.nome !== 'acompanhar' ? atual : nova));
  const inicio = () => ir({ nome: 'inicio' });
  // cada pedido de consulta ganha um número novo, que recria o Acompanhar e descarta o resultado antigo
  const consultar = (codigo: string) => setTela(atual => ({ nome: 'acompanhar', codigo, consulta: atual.nome === 'acompanhar' ? atual.consulta + 1 : 0 }));
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
        TETRA-GUARD
      </button>
      <nav className="navegacao" aria-label="Principal">
        {item('Início', 'inicio', inicio)}
        {item('Pedir ajuda', 'pedir', () => ir({ nome: 'denuncia' }))}
        {item('Acompanhar', 'acompanhar', () => consultar(''))}
      </nav>
    </div></header>
    <main id="conteudo" ref={main} tabIndex={-1} className="portal">
      {tela.nome !== 'inicio' && <button type="button" className="botao-texto" disabled={enviandoDenuncia} onClick={inicio}>Voltar ao início</button>}
      {tela.nome === 'inicio' && <Inicio onAjuda={() => ir({ nome: 'denuncia' })} onAcompanhar={consultar} onAcolhimento={() => ir({ nome: 'acolhimento' })} />}
      {tela.nome === 'acolhimento' && <Acolhimento onEnviando={setEnviandoDenuncia} onCriado={consultar} />}
      {tela.nome === 'denuncia' && <Pedido onEnviando={setEnviandoDenuncia} onEnviado={(resultado, extras) => { guardarAcesso(resultado.codigo); setTela({ nome: 'confirmacao', resultado, extras }); }} />}
      {tela.nome === 'confirmacao' && <Confirmacao resultado={tela.resultado} orientacao={tela.extras?.orientacao} respostasNaoEnviadas={tela.extras?.respostasNaoEnviadas} onAcompanhar={() => consultar(tela.resultado.codigo)} />}
      {tela.nome === 'acompanhar' && <Acompanhar key={tela.consulta} codigoInicial={tela.codigo} />}
    </main>
    <footer className="rodape">Um canal da escola para ouvir e cuidar.</footer>
  </div>;
}
