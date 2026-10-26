import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

export type ItemMenu = { rotulo: string; aoEscolher: () => void; devolveFoco?: boolean };

/** Menu "⋯" de uma mensagem: botão-gatilho e lista role="menu" com navegação por teclado. */
export default function MenuMensagem({ itens, desabilitado, gatilhoRef, rotulo = 'Ações da mensagem' }: {
  itens: ItemMenu[]; desabilitado: boolean; rotulo?: string; gatilhoRef: RefObject<HTMLButtonElement | null>;
}) {
  const [aberto, setAberto] = useState(false), [acima, setAcima] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => { if (aberto) botoes.current[0]?.focus(); }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: Event) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (itens.length === 0) return null;

  const focar = (indice: number) => botoes.current[(indice + itens.length) % itens.length]?.focus();
  function teclas(e: KeyboardEvent) {
    const atual = botoes.current.findIndex(b => b === document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focar(atual + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focar(atual - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focar(0); }
    else if (e.key === 'End') { e.preventDefault(); focar(itens.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAberto(false); gatilhoRef.current?.focus(); }
    else if (e.key === 'Tab') { gatilhoRef.current?.focus(); setAberto(false); }
  }
  function escolher(item: ItemMenu) {
    setAberto(false);
    if (item.devolveFoco) gatilhoRef.current?.focus();
    item.aoEscolher();
  }

  return <div ref={raiz} className="mensagem-menu">
    <button ref={gatilhoRef} type="button" className="mensagem-menu-gatilho" aria-haspopup="menu" aria-expanded={aberto}
      aria-label={rotulo} aria-disabled={desabilitado || undefined} onClick={() => {
        if (desabilitado) return;
        // Mensagem na metade inferior da tela: abre para cima para não cobrir o compositor fixo.
        const topo = gatilhoRef.current?.getBoundingClientRect?.()?.top;
        setAcima(topo !== undefined && topo > window.innerHeight / 2);
        setAberto(a => !a);
      }}>⋯</button>
    {aberto && <ul role="menu" aria-label="Ações da mensagem" className={acima ? 'mensagem-menu-lista abre-para-cima' : 'mensagem-menu-lista'} onKeyDown={teclas}>
      {itens.map((item, i) => <li key={item.rotulo} role="none">
        <button ref={el => { botoes.current[i] = el; }} type="button" role="menuitem" tabIndex={-1} onClick={() => escolher(item)}>{item.rotulo}</button>
      </li>)}
    </ul>}
  </div>;
}
