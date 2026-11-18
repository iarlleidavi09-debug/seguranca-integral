import { useEffect, useRef, useState } from 'react';
import { ErroApi, mensagemErro } from '../shared/api';
import { normalizarCodigo } from './acessos';
import './anexarImagens.css';

type Resultado = { anexos_adicionados: number; anexos_total: number; anexos_recusados: { nome: string; motivo: string }[] };

export default function AnexarImagens({ codigo, totalInicial = 0, aoEnviar }: {
  codigo: string; totalInicial?: number; aoEnviar: (total: number) => void;
}) {
  const [total, setTotal] = useState(totalInicial);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [recusados, setRecusados] = useState<Resultado['anexos_recusados']>([]);
  const entrada = useRef<HTMLInputElement>(null);
  const montado = useRef(true);
  const emCurso = useRef(false);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => { setTotal(totalInicial); }, [totalInicial]);
  const restantes = Math.max(0, 5 - total);
  const limite = arquivos.length > restantes
    ? `Você pode enviar mais ${restantes} ${restantes === 1 ? 'imagem' : 'imagens'} neste caso.`
    : arquivos.some(a => a.size > 5 * 1024 * 1024) ? 'Cada imagem deve ter até 5 MB.' : '';

  async function enviar() {
    if (emCurso.current || !arquivos.length || limite) return;
    emCurso.current = true;
    setEnviando(true); setErro(''); setAviso(''); setRecusados([]);
    const form = new FormData();
    form.append('codigo', normalizarCodigo(codigo) || codigo);
    arquivos.forEach(a => form.append('anexos[]', a));
    try {
      let resposta: Response;
      try {
        resposta = await fetch('/api/acompanhar/anexos', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
      } catch { throw new ErroApi(0); }
      if (!resposta.ok) {
        throw new ErroApi(resposta.status);
      }
      const dados: Resultado = await resposta.json();
      if (!Number.isInteger(dados.anexos_total) || !Number.isInteger(dados.anexos_adicionados) || !Array.isArray(dados.anexos_recusados)) throw new ErroApi(502);
      if (!montado.current) return;
      setTotal(dados.anexos_total); setRecusados(dados.anexos_recusados);
      setAviso(dados.anexos_adicionados === 1 ? '1 imagem enviada para a coordenação.'
        : dados.anexos_adicionados > 1 ? `${dados.anexos_adicionados} imagens enviadas para a coordenação.` : 'Nenhuma imagem foi enviada. Confira os motivos abaixo e selecione os arquivos novamente.');
      setArquivos([]);
      if (entrada.current) entrada.current.value = '';
      aoEnviar(dados.anexos_total);
    } catch (falha) {
      if (montado.current) setErro(falha instanceof ErroApi && falha.status === 400
        ? 'Confira a seleção. O caso aceita até 5 imagens no total. Se enviou imagens em outra aba, reabra o acompanhamento para conferir o limite.'
        : mensagemErro(falha));
    } finally {
      emCurso.current = false;
      if (montado.current) setEnviando(false);
    }
  }

  return <details className="recolhivel anexar-imagens">
    <summary>Adicionar imagens</summary>
    <p className="texto-pequeno">{total} de 5 imagens neste caso. Você pode enviar imagens que faltaram no primeiro envio. PNG, JPEG, WebP ou GIF, até 5 MB cada.</p>
    {restantes > 0 ? <form onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <label htmlFor="anexos-acompanhamento">Selecionar imagens</label>
      <input id="anexos-acompanhamento" ref={entrada} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={enviando}
        onChange={e => { setArquivos(Array.from(e.target.files || [])); setErro(''); setAviso(''); setRecusados([]); }} />
      {arquivos.length > 0 && <ul className="anexar-selecionados">{arquivos.map((arquivo, i) => <li key={`${i}-${arquivo.name}`}>{arquivo.name}</li>)}</ul>}
      <button className="botao secundario" disabled={enviando || !arquivos.length || !!limite}>{enviando ? 'Enviando imagens…' : 'Enviar imagens'}</button>
    </form> : <p>Este caso já tem o limite de 5 imagens.</p>}
    {(erro || limite) && <p role="alert" className="erro">{erro || limite}</p>}
    {aviso && <p role="status">{aviso}</p>}
    {recusados.length > 0 && <div role="alert"><p>Estas imagens não foram enviadas. Selecione uma nova versão para tentar de novo:</p>
      <ul>{recusados.map((arquivo, i) => <li key={i}>{arquivo.nome}: {arquivo.motivo}</li>)}</ul>
    </div>}
  </details>;
}
