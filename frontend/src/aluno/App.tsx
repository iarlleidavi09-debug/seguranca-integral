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
    if (telaAnterior.current !== tela) main.current?.focus();
    telaAnterior.current = tela;
  }, [tela]);
  return <>
    <a className="pular" href="#conteudo">Pular para o conteúdo</a>
    <header className="cabecalho"><div className="cabecalho-conteudo">
      <p className="marca">Segurança Integral</p><span>Portal do aluno</span>
    </div></header>
    <main id="conteudo" ref={main} tabIndex={-1} className="portal">
      {tela.nome !== 'inicio' && <button type="button" className="botao-texto" disabled={enviandoDenuncia} onClick={inicio}>Voltar ao início</button>}
      {tela.nome === 'inicio' && <Inicio onAjuda={() => setTela({ nome: 'denuncia' })} onAcompanhar={codigo => setTela({ nome: 'acompanhar', codigo })} />}
      {tela.nome === 'denuncia' && <Denuncia onEnviando={setEnviandoDenuncia} onEnviado={resultado => setTela({ nome: 'confirmacao', resultado })} />}
      {tela.nome === 'confirmacao' && <Confirmacao resultado={tela.resultado} onAcompanhar={() => setTela({ nome: 'acompanhar', codigo: tela.resultado.codigo })} />}
      {tela.nome === 'acompanhar' && <Acompanhar codigoInicial={tela.codigo} />}
    </main>
    <footer className="rodape">Um canal da escola para pedir ajuda e conversar com a coordenação.</footer>
  </>;
}
