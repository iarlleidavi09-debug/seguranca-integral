export type Tipo = 'cyberbullying' | 'ameaca' | 'vazamento' | 'perfil_falso' | 'golpe' | 'aliciamento' | 'outro';
export type Situacao6 = { id: string; tipo: Tipo; nome: string; descricao: string; opcoes: string[] };

export const LIMITE_RELATO = 5000;

export const SITUACOES: Situacao6[] = [
  { id: 'cyberbullying', tipo: 'cyberbullying', nome: 'Cyberbullying', descricao: 'Humilhação, perseguição ou ataques na internet.', opcoes: ['Estão me humilhando ou fazendo piadas comigo.', 'Estão espalhando mentiras ou boatos sobre mim.', 'Estão me excluindo de propósito.', 'Estão me perseguindo com mensagens e comentários.', 'Estão incentivando outras pessoas a me atacar.'] },
  { id: 'ameaca', tipo: 'ameaca', nome: 'Ameaças', descricao: 'Alguém está te ameaçando ou pressionando.', opcoes: ['Disseram que vão me machucar.', 'Ameaçaram divulgar algo particular meu.', 'Disseram que vão me encontrar ou me perseguir fora da internet.', 'Ameaçaram alguém próximo de mim.', 'Estão me ameaçando para me obrigar a fazer algo.'] },
  { id: 'vazamento', tipo: 'vazamento', nome: 'Vazamento de conteúdo particular', descricao: 'Compartilharam algo seu sem autorização.', opcoes: ['Compartilharam fotos ou vídeos meus sem minha autorização.', 'Divulgaram conversas, áudios ou capturas de tela particulares.', 'Espalharam meus dados pessoais, como telefone, endereço ou localização.', 'Divulgaram conteúdo íntimo meu.', 'Entraram na minha conta e expuseram informações minhas.'] },
  { id: 'perfil_falso', tipo: 'perfil_falso', nome: 'Perfil falso ou página de fofoca', descricao: 'Usaram uma identidade ou página para expor alguém.', opcoes: ['Criaram um perfil fingindo ser eu.', 'Usaram meu nome ou minha imagem em uma página de fofoca.', 'Publicaram boatos ou acusações sobre mim.', 'Criaram enquetes, rankings ou comparações para me constranger.', 'Usam um perfil ou uma página para expor e atacar outras pessoas da escola.'] },
  { id: 'golpe', tipo: 'golpe', nome: 'Golpe', descricao: 'Pedidos suspeitos, links ou falsas oportunidades.', opcoes: ['Tentaram me convencer a enviar dinheiro ou fazer um pagamento.', 'Pediram minha senha, código de acesso ou dados pessoais.', 'Enviaram um link ou arquivo suspeito para eu abrir.', 'Fingiram ser alguém ou alguma organização em que confio.', 'Ofereceram uma compra, prêmio, vaga ou oportunidade que parece falsa.'] },
  { id: 'aliciamento', tipo: 'aliciamento', nome: 'Aliciamento', descricao: 'Alguém está tentando se aproximar de você de um jeito que incomoda ou assusta.', opcoes: [] },
  { id: 'outro', tipo: 'outro', nome: 'Outros', descricao: 'Não encontrei minha situação nas opções.', opcoes: [] },
];

export function tipoDe(id: string): Tipo {
  return SITUACOES.find(s => s.id === id)?.tipo ?? 'outro';
}

/** Junta o relato às opções marcadas; sempre parte do texto base, então não acumula bloco. */
export function comporRelato(texto: string, marcadas: string[]): string {
  const base = texto.trim();
  if (!marcadas.length) return base;
  return base + '\n\nSituações marcadas:\n' + marcadas.map(o => '- ' + o).join('\n');
}
