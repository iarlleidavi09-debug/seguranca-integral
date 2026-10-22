import { useEffect, useRef, useState } from 'react';
import { obterPresenca, pulsarPresenca, removerPresenca } from '../shared/api';
import type { Atividade, PessoaPresente } from '../shared/api';
import { ouvirAtualizacoes } from '../shared/tempoReal';

const rotulos: Record<Atividade, string> = { vendo: 'vendo o caso', mensagem: 'escrevendo uma mensagem', nota: 'escrevendo uma nota' };

export default function Presenca({ casoId, atividade }: { casoId: number; atividade: Atividade }) {
  const [pessoas, setPessoas] = useState<PessoaPresente[]>([]);
  const aba = useRef('');
  if (!aba.current) aba.current = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  useEffect(() => {
    let ativo = true;
    let rodada = 0;
    const atualizar = async (pulso: boolean) => {
      if (document.hidden) return;
      const minha = ++rodada;
      try {
        const result = await (pulso ? pulsarPresenca(casoId, aba.current, atividade) : obterPresenca(casoId));
        if (ativo && minha === rodada) setPessoas(result.pessoas);
      } catch { /* A presença expira no servidor quando a rede não responde. */ }
    };
    const retirar = () => { void removerPresenca(casoId, aba.current).catch(() => {}); };
    const visibilidade = () => { if (document.hidden) { rodada++; retirar(); } else void atualizar(true); };
    void atualizar(true);
    const timer = setInterval(() => void atualizar(true), 10000);
    const parar = ouvirAtualizacoes(() => void atualizar(false));
    document.addEventListener('visibilitychange', visibilidade);
    return () => { ativo = false; clearInterval(timer); parar(); document.removeEventListener('visibilitychange', visibilidade); retirar(); };
  }, [casoId, atividade]);
  return <div className="texto-pequeno" aria-label="Equipe presente neste caso">
    {pessoas.length > 0 && <p>{pessoas.map(p => `${p.nome}: ${rotulos[p.atividade]}`).join(' · ')}</p>}
  </div>;
}
