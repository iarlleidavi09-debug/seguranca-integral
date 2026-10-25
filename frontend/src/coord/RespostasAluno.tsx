import type { QuestionarioCaso } from '../shared/api';

/** Respostas do questionário do aluno. Tudo entra como texto do React, nunca como HTML. */
export default function RespostasAluno({ questionario }: { questionario: QuestionarioCaso | null }) {
  if (!questionario) return <section className="respostas-aluno respostas-vazio">
    <h3 className="so-leitor">Respostas do aluno</h3>
    <p className="vazio-compacto">O aluno não respondeu ao questionário.</p>
  </section>;
  const dimensoes = questionario.dimensoes.filter(d => d.itens.length > 0);
  return <section className="respostas-aluno">
    <h3>Respostas do aluno</h3>
    <p className="respostas-situacao">Situação: {questionario.situacao.nome}</p>
    {questionario.marcadas.length > 0 && <>
      <p id="respostas-marcadas" className="respostas-rotulo">Opções marcadas</p>
      <ul className="respostas-marcadas" aria-labelledby="respostas-marcadas">
        {questionario.marcadas.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </>}
    {dimensoes.map(d => <div key={d.id} className="respostas-grupo">
      <h4>{d.rotulo}</h4>
      <dl>
        {d.itens.map((item, i) => <div key={i} className="respostas-item">
          <dt>{item.pergunta}</dt>
          {item.respostas.map((r, j) => <dd key={j}>{r}</dd>)}
        </div>)}
      </dl>
    </div>)}
  </section>;
}
