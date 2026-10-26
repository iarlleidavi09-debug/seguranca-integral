import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { VersaoMensagem } from '../shared/api';
import { dataLegivel } from './rotulos';
import MenuMensagem from './MenuMensagem';
import type { ItemMenu } from './MenuMensagem';

export const TEXTO_MAX = 2000;
export type Item = {
  chave: number; autor: string; texto: string; criado_em: string; lado?: string;
  id?: number; editada?: boolean; apagada?: boolean; podeAlterar?: boolean;
};
type Acoes = {
  aoEditar?: (id: number, texto: string) => Promise<void>;
  aoExcluir?: (id: number) => Promise<void>;
  aoVerVersoes?: (id: number) => Promise<VersaoMensagem[]>;
};

const ERRO_ACAO = 'Não foi possível concluir agora. Tente de novo.';

function ItemMensagem({ item, aoEditar, aoExcluir, aoVerVersoes }: { item: Item } & Acoes) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'excluir'>('ver');
  const [rascunho, setRascunho] = useState(item.texto);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [versoes, setVersoes] = useState<VersaoMensagem[] | null>(null);
  const trabalhando = useRef(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLLIElement>(null);
  const botaoManter = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef<'editar' | 'excluir' | null>(null);
  const excluiu = useRef(false); // exclusão confirmada: o foco espera o item virar "apagado"
  const id = item.id;

  useEffect(() => {
    if (modo === 'editar') campo.current?.focus();
    else if (modo === 'excluir') botaoManter.current?.focus();
    else if (devolverFoco.current) {
      // o gatilho do menu pode não existir (sem ações restantes): cai no próprio item
      // após exclusão confirmada o item é o alvo até a prop apagada chegar (o menu muda de itens)
      if (excluiu.current && item.apagada) { excluiu.current = false; (gatilho.current ?? raiz.current)?.focus(); }
      else (excluiu.current ? raiz.current : gatilho.current ?? raiz.current)?.focus();
      devolverFoco.current = null;
    }
  }, [modo]);

  useEffect(() => {
    if (item.apagada && excluiu.current) { excluiu.current = false; (gatilho.current ?? raiz.current)?.focus(); }
  }, [item.apagada]);

  const fechar = () => { devolverFoco.current = modo === 'editar' ? 'editar' : 'excluir'; setErro(''); setModo('ver'); };
  const abrirEdicao = () => { setRascunho(item.texto); setErro(''); setModo('editar'); };
  const teclas = (e: KeyboardEvent) => { if (e.key === 'Escape' && !trabalhando.current) { e.preventDefault(); fechar(); } };

  async function executar(acao: () => Promise<void>) {
    if (trabalhando.current) return;
    trabalhando.current = true; setOcupado(true); setErro('');
    try { await acao(); excluiu.current = modo === 'excluir'; devolverFoco.current = modo === 'editar' ? 'editar' : 'excluir'; setModo('ver'); }
    catch (falha) { setErro(falha instanceof Error && falha.message ? falha.message : ERRO_ACAO); }
    finally { trabalhando.current = false; setOcupado(false); }
  }
  function salvar() {
    const limpo = rascunho.trim();
    if (!limpo || limpo.length > TEXTO_MAX) { setErro(`Escreva de 1 a ${TEXTO_MAX} caracteres.`); return; }
    if (id === undefined || !aoEditar) return;
    void executar(() => aoEditar(id, limpo));
  }
  function confirmarExclusao() {
    if (id === undefined || !aoExcluir) return;
    void executar(() => aoExcluir(id));
  }
  async function alternarVersoes() {
    if (versoes) { setVersoes(null); return; }
    if (id === undefined || !aoVerVersoes || trabalhando.current) return;
    trabalhando.current = true; setOcupado(true); setErro('');
    try { setVersoes(await aoVerVersoes(id)); }
    catch { setErro(ERRO_ACAO); }
    finally { trabalhando.current = false; setOcupado(false); }
  }

  const podeAlterar = !!item.podeAlterar && !item.apagada && id !== undefined;
  const temVersoes = !!aoVerVersoes && id !== undefined && (!!item.editada || !!item.apagada);
  const itensMenu: ItemMenu[] = [];
  if (podeAlterar && aoEditar) itensMenu.push({ rotulo: 'Editar', aoEscolher: abrirEdicao });
  if (podeAlterar && aoExcluir) itensMenu.push({ rotulo: 'Excluir', aoEscolher: () => { setErro(''); setModo('excluir'); } });
  if (temVersoes) itensMenu.push({ rotulo: item.apagada ? (versoes ? 'Ocultar texto original' : 'Ver texto original') : (versoes ? 'Ocultar versões' : 'Ver versões'), devolveFoco: true, aoEscolher: () => void alternarVersoes() });

  return <li ref={raiz} tabIndex={-1} className="mensagem" data-autor={item.lado} onKeyDown={modo === 'ver' ? undefined : teclas}>
    <h3>{item.autor}</h3>
    {modo === 'editar'
      ? <div className="mensagem-edicao">
        <label htmlFor={`editar-${item.chave}`} className="texto-pequeno">Editar mensagem</label>
        <textarea id={`editar-${item.chave}`} ref={campo} rows={4} maxLength={TEXTO_MAX} value={rascunho} readOnly={ocupado} onChange={e => setRascunho(e.target.value)} />
        <p className="texto-pequeno contador">{rascunho.length} de {TEXTO_MAX}</p>
        <div className="mensagem-acoes">
          <button type="button" className="botao principal" disabled={ocupado} onClick={salvar}>Salvar</button>
          <button type="button" className="botao secundario" disabled={ocupado} onClick={fechar}>Cancelar</button>
        </div>
      </div>
      : item.apagada ? <p className="texto-pequeno">Mensagem apagada</p> : <p>{item.texto}</p>}
    <time dateTime={item.criado_em}>{dataLegivel(item.criado_em)}</time>
    {item.editada && !item.apagada && <span className="texto-pequeno mensagem-marca"> editada</span>}
    {modo === 'excluir' && <div className="mensagem-confirmacao">
      <p>Excluir esta mensagem? O aluno verá 'Mensagem apagada'.</p>
      <div className="mensagem-acoes">
        <button type="button" className="botao principal" disabled={ocupado} onClick={confirmarExclusao}>Excluir</button>
        <button ref={botaoManter} type="button" className="botao secundario" disabled={ocupado} onClick={fechar}>Cancelar</button>
      </div>
    </div>}
    {modo === 'ver' && itensMenu.length > 0 && <div className="mensagem-acoes"><MenuMensagem itens={itensMenu} desabilitado={ocupado} gatilhoRef={gatilho} rotulo={`Ações da mensagem de ${item.autor}, ${dataLegivel(item.criado_em)}`} /></div>}
    {erro && <p className="erro" role="alert">{erro}</p>}
    {versoes && <ul className="mensagem-versoes" aria-label="Versões anteriores">
      {versoes.length === 0 ? <li className="texto-pequeno">Nenhuma versão anterior.</li> : versoes.map(v => <li key={v.id}>
        <p>{v.texto}</p>
        <span className="texto-pequeno">{v.acao === 'exclusao' ? 'Texto antes da exclusão' : 'Texto antes da edição'}{v.usuario ? `, por ${v.usuario}` : ''}, <time dateTime={v.criado_em}>{dataLegivel(v.criado_em)}</time></span>
      </li>)}
    </ul>}
  </li>;
}

/** Verdadeiro em telas de até 760 px; sem matchMedia (jsdom) vale falso. */
function useTelaEstreita() {
  const consulta = () => window.matchMedia?.('(max-width: 760px)') ?? null;
  const [estreita, setEstreita] = useState(() => !!consulta()?.matches);
  useEffect(() => {
    const mq = consulta();
    if (!mq) return;
    const mudou = () => setEstreita(mq.matches);
    mudou();
    mq.addEventListener?.('change', mudou);
    return () => mq.removeEventListener?.('change', mudou);
  }, []);
  return estreita;
}

export default function Conversa({ titulo, campo, rotulo, ajuda, botao, itens, texto, aoMudar, aoEnviar, enviando, aoEditar, aoExcluir, aoVerVersoes }: {
  titulo: string; campo: string; rotulo: string; ajuda: string; botao: string; texto: string; enviando: boolean; itens: Item[];
  aoMudar: (valor: string) => void; aoEnviar: () => void;
} & Acoes) {
  const estreita = useTelaEstreita();
  const area = useRef<HTMLTextAreaElement>(null);
  const antes = useRef(enviando);
  // aria-disabled (e não disabled) mantém o foco no botão durante o envio; ao terminar com sucesso o foco vai para o campo já limpo
  useEffect(() => {
    if (antes.current && !enviando && texto === '') area.current?.focus();
    antes.current = enviando;
  }, [enviando]);
  const linhas = estreita ? Math.min(6, Math.max(2, texto.split('\n').length)) : 4;
  return <div>
    <h2 className="titulo-painel">{titulo}</h2>
    {itens.length === 0 ? <p className="vazio">Nada por aqui ainda.</p> : <ul className="mensagens">
      {itens.map(i => <ItemMensagem key={i.chave} item={i} aoEditar={aoEditar} aoExcluir={aoExcluir} aoVerVersoes={aoVerVersoes} />)}
    </ul>}
    <form className={estreita ? 'resposta resposta-fixa-coord' : 'resposta'} onSubmit={e => { e.preventDefault(); if (!enviando) aoEnviar(); }}>
      <label htmlFor={campo}>{rotulo}</label>
      <p id={`${campo}-ajuda`} className="texto-pequeno resposta-ajuda">{ajuda}</p>
      <textarea id={campo} ref={area} rows={linhas} maxLength={TEXTO_MAX} aria-describedby={`${campo}-ajuda`} value={texto} onChange={e => aoMudar(e.target.value)} />
      <div className="resposta-rodape">
        <p className="texto-pequeno contador">{texto.length} de {TEXTO_MAX}</p>
        <button type="submit" className="botao principal" aria-disabled={enviando || undefined}>{botao}</button>
      </div>
    </form>
  </div>;
}
