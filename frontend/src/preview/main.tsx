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
import Geral from '../coord/Geral';
import Fila from '../coord/Fila';
import Caso from '../coord/Caso';
import Usuarios from '../coord/Usuarios';
import Ensaio from '../coord/Ensaio';
import Navegacao from '../coord/Navegacao';
import type { Tela } from '../coord/Navegacao';
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
  { id: 'geral', grupo: 'Coordenação', nome: 'Visão geral', gatilho: 'Entrar ou menu Visão geral.' },
  { id: 'fila', grupo: 'Coordenação', nome: 'Casos', gatilho: 'Menu Casos, ou um atalho da Visão geral.' },
  { id: 'pos', grupo: 'Coordenação', nome: 'Pós-resolução', gatilho: 'Menu Pós-resolução. Lista casos resolvidos.' },
  { id: 'resolucao', grupo: 'Coordenação', nome: 'Caso · Resolução e prioridade', gatilho: 'Casos → clicar em um caso. Registrar resolução e Reavaliar prioridade ficam acima das abas.' },
  { id: 'mensagens', grupo: 'Coordenação', nome: 'Caso · Conversa', gatilho: 'Casos → clicar em um caso → Conversa.' },
  { id: 'notas', grupo: 'Coordenação', nome: 'Caso · Notas internas', gatilho: 'Caso → aba Notas internas.' },
  { id: 'anexo', grupo: 'Coordenação', nome: 'Caso · Anexo ampliado', gatilho: 'Caso → clicar na miniatura do anexo. Fechar ou Escape para voltar.' },
  { id: 'usuarios', grupo: 'Coordenação', nome: 'Usuários e criação', gatilho: 'Menu Usuários. O formulário Novo usuário está abaixo da lista.' },
  { id: 'desativar', grupo: 'Coordenação', nome: 'Confirmar desativação', gatilho: 'Usuários → Desativar outro usuário ativo.' },
  { id: 'ensaio', grupo: 'Coordenação', nome: 'Ensaio', gatilho: 'Menu Ensaio.' },
  { id: 'remover', grupo: 'Coordenação', nome: 'Confirmar remoção', gatilho: 'Ensaio → Remover simulação.' },
];

// Traduz a tela da prévia para a tela da navegação real e de volta.
function telaDaCoordenacao(id: string): Tela {
  if (id === 'geral') return { nome: 'geral' };
  if (id === 'pos') return { nome: 'pos' };
  if (id === 'usuarios' || id === 'desativar') return { nome: 'usuarios' };
  if (id === 'ensaio' || id === 'remover') return { nome: 'ensaio' };
  if (id === 'fila') return { nome: 'casos' };
  return { nome: 'caso', id: 1 };
}
function destinoDe(tela: Tela): string {
  return tela.nome === 'casos' ? 'fila' : tela.nome === 'caso' ? 'resolucao' : tela.nome;
}

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
      case 'login': return <Login aoEntrar={() => ir('geral')} />;
      case 'geral': return <Geral aoVerCasos={parcial => { setFiltros({ status: '', prioridade: '', tipo: '', q: '', ...parcial }); ir('fila'); }} aoAbrirCaso={() => ir('resolucao')} />;
      case 'fila': return <Fila modo="casos" aoAbrir={() => ir('resolucao')} filtros={filtros} aoFiltrar={setFiltros} />;
      case 'pos': return <Fila modo="pos" aoAbrir={() => ir('resolucao')} filtros={filtros} aoFiltrar={setFiltros} />;
      case 'resolucao': case 'mensagens': case 'notas': case 'anexo': return <Caso id={1} aoVoltar={() => ir('fila')} abaInicial={tela === 'notas' ? 'notas' : tela === 'mensagens' ? 'conversa' : 'relato'} anexoInicial={tela === 'anexo' ? 1 : null} imagemPrevia={dados.imagem} />;
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
      <div className="indice-aviso" role="note">Modo de revisão · Tema da coordenação · Dados de exemplo</div>
      <div key={`${tela}-${versao}`}>
        {atual.grupo === 'Aluno' ? <>
          <header className="cabecalho"><div className="cabecalho-conteudo"><p className="marca">Segurança Integral</p><span>Portal do aluno</span></div></header>
          <main id="previa-conteudo" tabIndex={-1} className="portal">
            {tela !== 'inicio' && <button className="botao-texto" onClick={() => ir('inicio')}>Voltar ao início</button>}
            {conteudo()}
          </main>
        </> : tela === 'login' ? <div className="coord-app">{conteudo()}</div> : <div className="coord-app">
          <div className="coord-layout">
            <div className="coord-lateral">
              <p className="marca">Segurança Integral <span>Coordenação</span></p>
              <Navegacao tela={telaDaCoordenacao(tela)} admin pendencias={0} aoIr={destino => ir(destinoDe(destino))} />
              <div className="sessao"><span className="sessao-nome">Equipe de exemplo</span>
                <button type="button" className="botao secundario" onClick={() => ir('login')}>Sair</button></div>
            </div>
            <div className="coord-coluna">
              <main id="previa-conteudo" tabIndex={-1} className="painel">{conteudo()}</main>
            </div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
