import { useEffect, useState } from 'react';
import { integridadeCaso, urlDossie } from '../shared/api';
import type { EstadoIntegridade, IntegridadeCaso } from '../shared/api';
import { dataLegivel } from './rotulos';

const ROTULO: Record<EstadoIntegridade, string> = {
  integro: 'Hash confere com o registrado',
  divergente: 'Arquivo diferente do registrado',
  sem_registro: 'Sem registro de integridade',
  ausente: 'Arquivo não encontrado',
};

/** Registro de integridade dos anexos e exportação do dossiê (data e hash são do servidor da escola, não prova legal). */
export default function Integridade({ casoId }: { casoId: number }) {
  const [dados, setDados] = useState<IntegridadeCaso | null>(null);
  useEffect(() => {
    const aborto = new AbortController();
    setDados(null);
    try {
      void Promise.resolve(integridadeCaso(casoId, aborto.signal)).then(setDados).catch(() => undefined);
    } catch { /* indicador é opcional: a tela do caso segue funcionando */ }
    return () => aborto.abort();
  }, [casoId]);
  if (!dados || dados.anexos.length === 0) return null;
  const problemas = dados.anexos.filter(a => a.estado === 'divergente' || a.estado === 'ausente').length;
  return <details className="integridade">
    <summary>Registro de integridade{problemas > 0 && <b className="integridade-alerta"> ({problemas} com problema)</b>}</summary>
    {problemas > 0 && <p role="alert" className="integridade-alerta">Atenção: há anexo diferente do registrado ou ausente.</p>}
    <ul>
      {dados.anexos.map((a, i) => <li key={a.id}>
        Anexo {i + 1}: {ROTULO[a.estado]}
        {a.recebido_em && <> · recebido em {dataLegivel(a.recebido_em)}</>}
        {a.sha256 && <code className="integridade-hash">{a.sha256}</code>}
      </li>)}
    </ul>
    <p className="vazio-compacto">Data e hash são do servidor da escola. É um registro de integridade, não prova legal.</p>
    {dados.pode_exportar && <a className="botao secundario" href={urlDossie(casoId)} download>Exportar dossiê do caso (PDF)</a>}
  </details>;
}
