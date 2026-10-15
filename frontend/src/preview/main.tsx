import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '../shared/tema.css';
import '../coord/coord.css';
import './preview.css';
import Inicio from '../aluno/Inicio';
import Denuncia from '../aluno/Denuncia';
import Confirmacao from '../aluno/Confirmacao';
import Acompanhar from '../aluno/Acompanhar';
import Login from '../coord/Login';
import Fila from '../coord/Fila';
import Caso from '../coord/Caso';
import Usuarios from '../coord/Usuarios';
import Ensaio from '../coord/Ensaio';
import { instalarDadosDePrevia } from './dados';

const dados = instalarDadosDePrevia();
const telas = [
  { id: 'inicio', grupo: 'Aluno', nome: 'Início', gatilho: 'Abrir o portal do aluno.' },
  { id: 'tipo', grupo: 'Aluno', nome: '1. Tipo de situação', gatilho: 'Início → Preciso de ajuda.' },
  { id: 'relato', grupo: 'Aluno', nome: '2. Relato', gatilho: 'Escolher o tipo → Continuar.' },
  { id: 'provas', grupo: 'Aluno', nome: '3. Provas e anonimato', gatilho: 'Preencher relato → Continuar.' },
  { id: 'identificacao', grupo: 'Aluno', nome: '3. Com identificação', gatilho: 'Provas → Quero me identificar.' },
  { id: 'confirmacao', grupo: 'Aluno', nome: 'Pedido recebido', gatilho: 'Enviar pedido de ajuda → envio aceito.' },
  { id: 'acompanhar', grupo: 'Aluno', nome: 'Acompanhamento e conversa', gatilho: 'Início → código → Acompanhar; ou confirmação → Acompanhar meu caso.' },
  { id: 'login', grupo: 'Coordenação', nome: 'Login', gatilho: 'Abrir coordenação sem sessão, sair ou sessão expirar.' },
  { id: 'fila', grupo: 'Coordenação', nome: 'Fila de casos', gatilho: 'Entrar ou menu Fila.' },
  { id: 'mensagens', grupo: 'Coordenação', nome: 'Caso · Mensagens ao aluno', gatilho: 'Fila → clicar em um caso → Mensagens ao aluno.' },
  { id: 'notas', grupo: 'Coordenação', nome: 'Caso · Notas internas', gatilho: 'Caso → Notas internas.' },
  { id: 'anexo', grupo: 'Coordenação', nome: 'Caso · Anexo ampliado', gatilho: 'Caso → clicar na miniatura do anexo. Fechar ou Escape para voltar.' },
  { id: 'usuarios', grupo: 'Coordenação', nome: 'Usuários e criação', gatilho: 'Menu Usuários. O formulário Novo usuário está abaixo da lista.' },
  { id: 'desativar', grupo: 'Coordenação', nome: 'Confirmar desativação', gatilho: 'Usuários → Desativar outro usuário ativo.' },
  { id: 'ensaio', grupo: 'Coordenação', nome: 'Ensaio', gatilho: 'Menu Ensaio.' },
  { id: 'remover', grupo: 'Coordenação', nome: 'Confirmar remoção', gatilho: 'Ensaio → Remover simulação.' },
];

function App() {
  const doHash = () => telas.some(t => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
  const [tela, setTela] = useState(doHash);
  const [versao, setVersao] = useState(0);
  const [filtros, setFiltros] = useState({ status: '', prioridade: '', tipo: '', q: '' });
  const atual = telas.find(t => t.id === tela)!;
  useEffect(() => {
    const navegar = () => setTela(doHash());
    window.addEventListener('hashchange', navegar);
    return () => window.removeEventListener('hashchange', navegar);
  }, []);
  const ir = (id: string) => { location.hash = id; setTela(id); };
  function conteudo() {
    switch (tela) {
      case 'inicio': return <Inicio onAjuda={() => ir('tipo')} onAcompanhar={() => ir('acompanhar')} />;
      case 'tipo': case 'relato': case 'provas': case 'identificacao':
        return <Denuncia passoInicial={tela === 'tipo' ? 1 : tela === 'relato' ? 2 : 3}
          chaveRascunho="si-previa-rascunho" dadosIniciais={{ tipo: 'perfil_falso', relato: 'Relato fictício para visualizar as etapas do pedido de ajuda.', anonimo: tela !== 'identificacao', nome: tela === 'identificacao' ? 'Aluno de exemplo' : '', turma: '' }}
          onEnviado={() => ir('confirmacao')} />;
      case 'confirmacao': return <Confirmacao resultado={{ codigo: 'PREVIA-001' }} onAcompanhar={() => ir('acompanhar')} />;
      case 'acompanhar': return <Acompanhar codigoInicial="PREVIA-001" />;
      case 'login': return <Login aoEntrar={() => ir('fila')} />;
      case 'fila': return <Fila modo="casos" aoAbrir={() => ir('mensagens')} filtros={filtros} aoFiltrar={setFiltros} />;
      case 'mensagens': case 'notas': case 'anexo': return <Caso id={1} aoVoltar={() => ir('fila')} abaInicial={tela === 'notas' ? 'notas' : 'mensagens'} anexoInicial={tela === 'anexo' ? 1 : null} imagemPrevia={dados.imagem} />;
      case 'usuarios': case 'desativar': return <Usuarios meuId={1} confirmarInicial={tela === 'desativar' ? 2 : null} />;
      case 'ensaio': case 'remover': return <Ensaio confirmarInicial={tela === 'remover'} />;
    }
  }
  return <div className="indice-layout">
    <a className="pular" href="#previa-conteudo" onClick={e => { e.preventDefault(); document.getElementById('previa-conteudo')?.focus(); }}>Pular para a prévia</a>
    <aside className="indice-lateral" aria-label="Índice de interfaces">
      <h1>Interfaces</h1>
      <p className="indice-intro">Segurança Integral<br />Selecione uma tela para revisar.</p>
      <nav aria-label="Telas de prévia">{['Aluno', 'Coordenação'].map(grupo => <section key={grupo}>
        <h2>{grupo}</h2>
        {telas.filter(t => t.grupo === grupo).map(t => <a key={t.id} href={`#${t.id}`} aria-current={t.id === tela ? 'page' : undefined} onClick={() => setTela(t.id)}>{t.nome}</a>)}
      </section>)}</nav>
      <p className="indice-nota">Prévia local com dados fictícios. As ações não enviam informações ao backend.</p>
      <a href="/revisao.html">Coordenação · acolhedora aprovada</a><br />
      <a href="/aluno-revisao.html">Aluno · jovem e expressiva aprovada</a><br />
      <a href="/">Portal do aluno</a><br /><a href="/coordenacao.html">Portal da coordenação</a>
    </aside>
    <div className="indice-direita">
      <header className="indice-barra">
        <div><strong>{atual.grupo} / {atual.nome}</strong><p>{atual.gatilho}</p></div>
        <button className="botao secundario" onClick={() => { dados.reiniciar(); setFiltros({ status: '', prioridade: '', tipo: '', q: '' }); setVersao(v => v + 1); }}>Reiniciar prévia</button>
      </header>
      <div className="indice-aviso" role="note">Modo de revisão · Visual original · Dados de exemplo</div>
      <div key={`${tela}-${versao}`}>
        {tela !== 'login' && (atual.grupo === 'Aluno' ? <header className="cabecalho"><div className="cabecalho-conteudo"><p className="marca">Segurança Integral</p><span>Portal do aluno</span></div></header>
          : <header className="coord-cabecalho"><div className="coord-cabecalho-conteudo"><p className="marca">Segurança Integral <span>Coordenação</span></p><nav aria-label="Principal">{['fila', 'usuarios', 'ensaio'].map(id => <button key={id} className="nav-item" onClick={() => ir(id)}>{id === 'fila' ? 'Fila' : id === 'usuarios' ? 'Usuários' : 'Ensaio'}</button>)}</nav><button className="botao secundario" onClick={() => ir('login')}>Sair</button></div></header>)}
        {tela === 'login' ? conteudo() : <main id="previa-conteudo" tabIndex={-1} className={atual.grupo === 'Aluno' ? 'portal' : 'painel'}>
          {atual.grupo === 'Aluno' && tela !== 'inicio' && <button className="botao-texto" onClick={() => ir('inicio')}>Voltar ao início</button>}
          {conteudo()}
        </main>}
      </div>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
