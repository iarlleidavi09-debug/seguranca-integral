import { useRef, useState } from 'react';
import { ErroApi, mensagemErro } from '../shared/api';
import { guardarAcesso } from './acessos';
export default function Acolhimento({ onCriado, onEnviando }: { onCriado: (codigo: string) => void; onEnviando: (valor: boolean) => void }) {
 const [texto, setTexto] = useState(''); const [erro, setErro] = useState(''); const [enviando, setEnviando] = useState(false);
 const ocupado = useRef(false); const tentativa = useRef<{ texto: string; id: string } | null>(null);
 async function enviar() {
  if (ocupado.current) return;
  const mensagem = texto.trim();
  if (!mensagem || mensagem.length > 2000) { setErro('Escreva uma mensagem de 1 a 2000 caracteres.'); return; }
  if (tentativa.current?.texto !== mensagem) {
   const bytes = crypto.getRandomValues(new Uint8Array(16));
   tentativa.current = { texto: mensagem, id: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
  }
  ocupado.current = true; setEnviando(true); onEnviando(true); setErro('');
  try {
   let resposta: Response;
   try { resposta = await fetch('/api/acolhimento', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envio_id: tentativa.current.id, texto: mensagem }) }); }
   catch { throw new ErroApi(0); }
   if (!resposta.ok) throw new ErroApi(resposta.status);
   const dados = await resposta.json();
   if (typeof dados.codigo !== 'string') throw new ErroApi(502);
   guardarAcesso(dados.codigo); onCriado(dados.codigo);
  } catch (falha) { setErro(mensagemErro(falha)); }
  finally { ocupado.current = false; setEnviando(false); onEnviando(false); }
 }
 return <section><h1>Acolhimento anônimo</h1><p>Converse com a coordenação sem questionário e sem informar nome, ano ou turma. Ao enviar a primeira mensagem, você recebe um código para voltar à conversa.</p><p>Não escreva dados que possam identificar você se quiser manter o anonimato.</p>
 <form noValidate aria-busy={enviando} onSubmit={e => { e.preventDefault(); void enviar(); }}><label htmlFor="acolhimento-texto">Sua primeira mensagem</label><textarea id="acolhimento-texto" rows={5} maxLength={2000} value={texto} disabled={enviando} onChange={e => setTexto(e.target.value)} /><p className="texto-pequeno">{texto.length} de 2000 caracteres</p><p className="texto-pequeno">Ao enviar, a escola guarda sua mensagem para cuidar do caso. O serviço ou a rede podem registrar os horários de acesso.</p><button className="botao principal" disabled={enviando}>{enviando ? 'Enviando mensagem…' : 'Iniciar conversa anônima'}</button></form>{erro && <p role="alert" className="erro">{erro}</p>}</section>;
}
