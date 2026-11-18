import { useState } from 'react';
import type { FiltrosFila } from '../shared/api';
import { filtrosParaFavorito, guardarFavoritos, lerFavoritos } from './filtrosFavoritos';
import type { FavoritoFila } from './filtrosFavoritos';

export default function FavoritosFila({ usuario, fila, filtros, aoAplicar }: {
  usuario: number; fila: string; filtros: FiltrosFila; aoAplicar: (filtros: FiltrosFila) => void;
}) {
  const [favoritos, setFavoritos] = useState(() => lerFavoritos(usuario, fila));
  const [nome, setNome] = useState('');
  const [aviso, setAviso] = useState('');
  function guardar(proximos: FavoritoFila[]) {
    setFavoritos(proximos);
    setAviso(guardarFavoritos(usuario, fila, proximos) ? '' : 'O navegador não permitiu guardar os favoritos. Eles ficam disponíveis só nesta visita.');
  }
  return <details className="fila-favoritos">
    <summary>Filtros favoritos{favoritos.length > 0 ? ` (${favoritos.length})` : ''}</summary>
    <p className="texto-pequeno" id="favoritos-ajuda">Neste navegador, para sua conta. O texto da busca não é salvo. Use um nome sem dados de alunos.</p>
    {favoritos.length > 0 && <ul>{favoritos.map(f => <li key={f.nome}>
      <button type="button" className="botao secundario" aria-label={`Aplicar ${f.nome}`} onClick={() => aoAplicar({ ...f.filtros, q: '' })}>{f.nome}</button>
      <button type="button" className="botao-texto" aria-label={`Remover ${f.nome}`} onClick={() => guardar(favoritos.filter(atual => atual.nome !== f.nome))}>Remover</button>
    </li>)}</ul>}
    <form className="fila-favoritos-form" onSubmit={e => {
      e.preventDefault();
      const rotulo = nome.trim();
      if (!rotulo) return;
      guardar([...favoritos.filter(f => f.nome !== rotulo), { nome: rotulo, filtros: filtrosParaFavorito(filtros) }]);
      setNome('');
    }}>
      <div><label htmlFor="favorito-nome">Nome do filtro favorito</label><input id="favorito-nome" maxLength={40} value={nome} autoComplete="off" aria-describedby="favoritos-ajuda" onChange={e => setNome(e.target.value)} /></div>
      <button type="submit" className="botao secundario" disabled={!nome.trim() || (favoritos.length >= 10 && !favoritos.some(f => f.nome === nome.trim()))}>Salvar filtro favorito</button>
    </form>
    {favoritos.length >= 10 && <p className="texto-pequeno">Limite de 10 favoritos. Remova um para guardar outro.</p>}
    {aviso && <p className="aviso" role="status">{aviso}</p>}
  </details>;
}
