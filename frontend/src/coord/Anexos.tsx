import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { urlAnexo } from '../shared/api';
import type { CasoDetalhe } from '../shared/api';

export default function Anexos({ caso, anexoInicial = null, imagemPrevia }: { caso: CasoDetalhe; anexoInicial?: number | null; imagemPrevia?: string }) {
  const [aberto, setAberto] = useState<number | null>(anexoInicial);
  const origem = useRef<HTMLElement | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (aberto !== null) fechar.current?.focus(); }, [aberto]);
  function fecharJanela() { setAberto(null); origem.current?.focus(); }
  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fecharJanela(); }
    if (e.key === 'Tab') { e.preventDefault(); fechar.current?.focus(); }
  }
  if (caso.anexos.length === 0) return <p className="vazio-compacto">Sem anexos.</p>;
  return <>
    <ul className="miniaturas">
      {caso.anexos.map((a, i) => <li key={a.id}>
        <button type="button" className="miniatura" aria-label={`Ampliar anexo ${i + 1}`}
          onClick={e => { origem.current = e.currentTarget; setAberto(a.id); }}>
          <img src={imagemPrevia ?? urlAnexo(caso.id, a.id)} alt={`Anexo ${i + 1} do caso ${caso.id}`} loading="lazy" />
        </button>
      </li>)}
    </ul>
    {aberto !== null && <div className="fundo-janela" onClick={fecharJanela}>
      <div className="janela" role="dialog" aria-modal="true" aria-label="Anexo ampliado" onKeyDown={teclas} onClick={e => e.stopPropagation()}>
        <img src={imagemPrevia ?? urlAnexo(caso.id, aberto)} alt={`Anexo ampliado do caso ${caso.id}`} />
        <button type="button" ref={fechar} className="botao secundario" onClick={fecharJanela}>Fechar</button>
      </div>
    </div>}
  </>;
}
