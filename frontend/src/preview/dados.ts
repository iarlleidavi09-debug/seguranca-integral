import type { CasoDetalhe, UsuarioLista } from '../shared/api';

const data = '2026-10-14T15:00:00Z';
export const casoExemplo: CasoDetalhe = {
  id: 1, tipo: 'perfil_falso', prioridade: 'media', prioridade_original: 'media', pontos: 3, status: 'em_investigacao',
  recorrencia_pendente: false, ultimo_acesso: null, resolucoes: [], situacoes: [], revisoes_recorrencia: [],
  em_andamento: false, anonimo: true, simulacao: true,
  criado_em: data, atualizado_em: data, relato: 'Exemplo fictício para avaliar a interface: encontrei um perfil usando meu nome e gostaria de conversar com a escola.',
  quando: 'Hoje', onde: 'Rede social', nome: null, turma: null,
  questionario: {
    situacao: { id: 'perfil_falso', nome: 'Perfil falso' },
    marcadas: ['Alguém usa meu nome e minhas fotos', 'Outras pessoas já viram o perfil'],
    dimensoes: [
      { id: 'quando', rotulo: 'Quando', itens: [{ pergunta: 'Quando você viu o perfil?', respostas: ['Hoje'] }] },
      { id: 'alcance', rotulo: 'Alcance', itens: [{ pergunta: 'Quem mais sabe?', respostas: ['Colegas da turma', 'Amigos de fora da escola'] }] },
    ],
  },
  motivos: ['tipo: perfil_falso'], anexos: [{ id: 1, tipo: 'image/svg+xml', tamanho: 1000 }],
  eventos: [{ id: 1, tipo: 'criado', usuario_id: null, usuario: null, detalhe: 'prioridade media', criado_em: data }],
  mensagens: [
    { autor: 'aluno', texto: 'Esta é uma conversa fictícia para visualizar a tela.', criado_em: data, usuario_id: null, usuario: null, editada_em: null, apagada_em: null, pode_alterar: false },
    { autor: 'coordenacao', texto: 'Estamos aqui para te ouvir. Podemos conversar sobre o que aconteceu?', criado_em: data, usuario_id: 1, usuario: 'Equipe de exemplo', editada_em: null, apagada_em: null, pode_alterar: false },
  ],
  notas: [{ id: 1, usuario_id: 1, usuario: 'Equipe de exemplo', texto: 'Nota fictícia para avaliar a organização das informações.', criado_em: data }],
};

export function instalarDadosDePrevia() {
  let caso = structuredClone(casoExemplo);
  let usuarios: UsuarioLista[] = [{ id: 1, nome: 'Equipe de exemplo', ativo: true, papel: 'admin' }, { id: 2, nome: 'Usuário de exemplo', ativo: true, papel: 'coordenador' }];
  let simulacao = true;
  const imagem = '/previa-anexo.svg';
  window.fetch = async (entrada, init) => {
    const caminho = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.pathname : entrada.url;
    const url = caminho.split('?')[0];
    const metodo = init?.method ?? 'GET';
    const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const resposta = (valor: unknown, status = 200) => new Response(JSON.stringify(valor), { status, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/eu') return resposta({ id: 1, nome: 'Equipe de exemplo', papel: 'admin' });
    if (url === '/api/login' || url === '/api/logout') return resposta({ ok: true, nome: 'Equipe de exemplo' });
    if (url === '/api/denuncias') return resposta({ codigo: 'PREVIA-001' });
    if (url === '/api/acompanhar') return resposta({ status: caso.status, mensagens: caso.mensagens });
    if (url === '/api/acompanhar/mensagens') {
      caso.mensagens.push({ autor: 'aluno', texto: corpo.texto, criado_em: new Date().toISOString(), usuario_id: null, usuario: null, editada_em: null, apagada_em: null, pode_alterar: false });
      return resposta({ ok: true });
    }
    if (url === '/api/resumo') {
      const status = { novo: 0, em_investigacao: 0, resolvido: 0 };
      const prioridade = { critica: 0, alta: 0, media: 0, baixa: 0 };
      if (simulacao) { status[caso.status] = 1; prioridade[caso.prioridade] = 1; }
      return resposta({ status, prioridade, recorrencia_pendente: simulacao && caso.recorrencia_pendente ? 1 : 0 });
    }
    if (url === '/api/casos') {
      const consulta = new URLSearchParams(caminho.split('?')[1]);
      const mostrar = simulacao && (!consulta.get('status') || consulta.get('status') === caso.status)
        && (!consulta.get('prioridade') || consulta.get('prioridade') === caso.prioridade)
        && (!consulta.get('tipo') || consulta.get('tipo') === caso.tipo);
      return resposta({ casos: mostrar ? [{ ...caso, resumo: caso.relato, ultimo_acesso_por: caso.ultimo_acesso?.por ?? null, ultimo_acesso_em: caso.ultimo_acesso?.em ?? null }] : [] });
    }
    if (url === '/api/casos/1') return resposta(caso);
    if (url === '/api/casos/1/anexos/1') return new Response(null, { status: 404 });
    if (url === '/api/casos/1/status') { caso.status = corpo.status; return resposta({ ok: true }); }
    if (url === '/api/casos/1/prioridade') {
      caso.eventos.push({ id: caso.eventos.length + 1, tipo: 'prioridade', usuario_id: 1, usuario: 'Equipe de exemplo', detalhe: `${caso.prioridade} -> ${corpo.prioridade}: ${corpo.justificativa}`, criado_em: new Date().toISOString() });
      caso.prioridade = corpo.prioridade; return resposta({ ok: true });
    }
    if (url === '/api/casos/1/resolucao') {
      if (caso.status === 'resolvido') return resposta({ erro: 'Caso já resolvido.' }, 409);
      caso.status = 'resolvido';
      caso.resolucoes.push({ desfecho: corpo.desfecho, providencias: corpo.providencias, resultado: corpo.resultado ?? '', usuario: 'Equipe de exemplo', criado_em: new Date().toISOString() });
      return resposta({ ok: true });
    }
    if (url === '/api/casos/1/revisao-recorrencia') {
      if (!caso.recorrencia_pendente) return resposta({ erro: 'Sem recorrência pendente.' }, 409);
      caso.recorrencia_pendente = false;
      caso.revisoes_recorrencia.push({ usuario: 'Equipe de exemplo', criado_em: new Date().toISOString() });
      return resposta({ ok: true });
    }
    if (url === '/api/casos/1/mensagens') {
      caso.mensagens.push({ autor: 'coordenacao', texto: corpo.texto, criado_em: new Date().toISOString(), usuario_id: 1, usuario: 'Equipe de exemplo', editada_em: null, apagada_em: null, pode_alterar: false });
      return resposta({ ok: true });
    }
    if (url === '/api/casos/1/notas') {
      caso.notas.push({ id: caso.notas.length + 1, usuario_id: 1, usuario: 'Equipe de exemplo', texto: corpo.texto, criado_em: new Date().toISOString() });
      return resposta({ ok: true });
    }
    if (url === '/api/usuarios' && metodo === 'GET') return resposta({ usuarios });
    if (url === '/api/usuarios' && metodo === 'POST') {
      const usuario: UsuarioLista = { id: usuarios.length + 1, nome: corpo.nome, ativo: true, papel: 'coordenador' };
      usuarios.push(usuario); return resposta(usuario);
    }
    const desativar = /^\/api\/usuarios\/(\d+)\/desativar$/.exec(url);
    if (desativar) { usuarios = usuarios.map(u => u.id === Number(desativar[1]) ? { ...u, ativo: false } : u); return resposta({ ok: true }); }
    if (url === '/api/simulacao/carregar') { const criados = simulacao ? 0 : 1; simulacao = true; return resposta({ criados }); }
    if (url === '/api/simulacao') { const removidos = simulacao ? 1 : 0; simulacao = false; return resposta({ removidos }); }
    return resposta({ erro: 'Recurso indisponível nesta prévia.' }, 404);
  };
  // A imagem usa o mesmo componente de produção, com um recurso local de exemplo.
  return { imagem, reiniciar: () => {
    caso = structuredClone(casoExemplo);
    usuarios = [{ id: 1, nome: 'Equipe de exemplo', ativo: true, papel: 'admin' }, { id: 2, nome: 'Usuário de exemplo', ativo: true, papel: 'coordenador' }];
    simulacao = true;
  } };
}
