# Acesso aos casos, acolhimento e organização das conversas

## Objetivo

Corrigir as dificuldades observadas nos testes na escola: iniciar um relato, reencontrar casos, perceber respostas e localizar conversas que precisam de atendimento.

## Requisitos confirmados

- O navegador deve lembrar os casos do aluno para permitir reabertura.
- A entrada deve explicar como iniciar uma denúncia.
- Acompanhar um caso deve levar diretamente à conversa, com indicação de mensagens novas.
- Um botão de acolhimento deve abrir uma conversa anônima sem questionário, nome, ano ou turma obrigatórios.
- A coordenação precisa de filtros de mensagens e estados de conversa.
- Foi solicitada exportação compatível com ROE; o usuário não possui modelo de referência. Não afirmar compatibilidade sem validar um modelo.

## Proposta de funcionamento

### Aluno

Manter a identidade visual e a implementação React existentes. A tela inicial terá ações claras para relatar, acompanhar e pedir acolhimento, acompanhadas de explicações curtas sobre o próximo passo.

Guardar localmente os códigos de casos criados ou acessados com sucesso, sem duplicatas e sem armazenar o conteúdo das conversas. Oferecer remoção individual e de todos os acessos. Informar que os acessos ficam neste navegador e que outras pessoas que o utilizarem poderão reabrir esses casos. Falhas de armazenamento não devem impedir o atendimento. Essa mudança substitui especificamente a restrição anterior de PRODUCT.md que proibia guardar códigos; códigos continuam fora das URLs.

Abrir a conversa após validar o código, levando o foco ao título da conversa sem acionar automaticamente o teclado. Distinguir respostas novas da coordenação, anunciar atualizações de modo acessível e confirmar envio ou falha. Não marcar como lidas respostas que o aluno ainda não abriu.

O acolhimento cria um atendimento próprio, identificado internamente como acolhimento, e permite enviar a primeira mensagem diretamente. Não exigir classificação de ocorrência, dados escolares ou respostas do questionário. Fornecer código e acesso salvo para retornar à mesma conversa. Não inventar dados escolares para satisfazer campos obrigatórios. Evitar atendimentos vazios e duplicação em tentativas de reenvio.

### Coordenação

Adicionar uma visão de conversas com prévia da última mensagem, horário e filtros combináveis com os existentes. Separar o estado da conversa do status administrativo e da prioridade do caso.

Definição proposta dos estados:

- Sem mensagem: nenhuma mensagem trocada no chat; o relato inicial não conta como mensagem.
- Mensagem nova: mensagem do aluno ainda não lida pela coordenação.
- Aguardando resposta da equipe: a última mensagem é do aluno, mesmo quando já lida.
- Aguardando resposta do aluno: a última mensagem é da coordenação.

Mensagem nova tem precedência visual. Abrir a conversa registra a leitura; apenas listar ou abrir outra seção do caso não registra leitura. A leitura será por usuário da equipe, para que um colega não retire o aviso dos demais; esse é um padrão proposto, não uma decisão já confirmada pelo usuário. Atualizações simultâneas devem preservar mensagens recebidas durante a leitura.

### Exportação

Disponibilizar na coordenação um relatório estruturado por caso para apoiar preenchimento manual do ROE. Usar dados existentes: datas, relato, situação, local quando informado, providências e desfecho. Ausências permanecem explícitas, sem inferir identidades ou classificações oficiais. Excluir códigos de acesso. O formato de entrega será decidido no plano técnico. Importação automática e compatibilidade oficial permanecem pendentes de uma especificação ROE.

## Preservação e validação

Preservar casos e códigos existentes, separar notas internas da conversa do aluno e manter operação na rede local sem serviços externos. Não sobrescrever alterações locais preexistentes.

Verificar armazenamento indisponível, reabertura e remoção de acessos, foco no chat, leitura de mensagens, anonimato sem dados escolares, estados da fila, autorização da exportação e regressões dos fluxos atuais. Executar testes pertinentes do backend e frontend e verificar os dois builds.

## Estado

Requisitos de acolhimento sem nome, ano ou turma confirmados. Em 20/10/2026, o usuário delegou decisões e aprovações para permitir execução sem interrupções. Implementação realizada conforme plano; exportação oficial ROE segue pendente de um modelo externo.
