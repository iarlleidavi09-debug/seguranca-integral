# Definições aprovadas — Segurança Integral

Referência consolidada da entrevista. Atualização: 15/10/2026.

## Responsabilidades

Este projeto cuida do frontend, navegação e polimento. **O backend é responsabilidade de outro agente de IA.** Pesos, classificação, persistência, autenticação e contratos de API serão alinhados com esse agente; não inventar regras ou contratos definitivos no frontend.

As prévias usam dados fictícios em memória; não são integração concluída. Preservar os componentes originais, seus testes e o mapa de navegação como base funcional até o redesenho e a integração cobrirem todas as telas.

## Direção informada pelo usuário

- Escopo: redesenhar todas as interfaces conhecidas dos portais do aluno e da coordenação.
- Problema atual: a interface está muito seca; precisa ser mais dócil com o usuário.
- Público aluno: faixa de 15 a 21 anos, interpretada da resposta “15+ 21-”.
- Sensação desejada ao abrir: acolhimento e segurança.
- Pedido de apoio à revisão: navegação para visualizar cada tela e aba.

## Implementação de apoio

O índice em `/interfaces.html` reutiliza os componentes originais e usa dados fictícios, sem envio ao backend. Prévias escolhidas: `/aluno-revisao.html` (jovem e expressiva) e `/revisao.html` (coordenação acolhedora).

## Pendências reais

- Detalhar perguntas e alternativas do terceiro nível e de “Outros”.
- Alinhar pesos, faixas, sinais de alerta e contrato de API com o agente de backend.
- Confirmar campos obrigatórios do registro de encerramento.
- Aplicar as direções aprovadas às demais interfaces e integrar quando o contrato estiver definido.

## Fluxo da coordenação informado pelo usuário

- Visualizar casos por prioridade e relevância, calculadas por pesos das respostas do pedido de ajuda.
- Fluxo geral: investigar → atualizar status → tratamento/acolhimento (anônimo ou identificado) → resolução final.
- Ampliar as funções da coordenação e polir as interfaces.

## Questionário adaptativo

O usuário propôs cinco situações principais, cada uma com cinco desdobramentos e mais cinco opções em um terceiro nível. As respostas terão pesos para apoiar a priorização. A estrutura completa e os pesos ainda serão definidos.

Situações informadas: cyberbullying; ameaças; vazamento de conteúdo particular; perfil falso ou página de fofoca; golpe. “Outros” será a alternativa adicional para situações que não se encaixem nessas categorias.

### Cyberbullying: opções aprovadas

1. Estão me humilhando ou fazendo piadas comigo: insultos, apelidos ou comentários que me constrangem.
2. Estão espalhando mentiras ou boatos sobre mim: publicações ou mensagens para prejudicar minha imagem.
3. Estão me excluindo de propósito: exclusão de grupos ou atividades para me isolar ou constranger.
4. Estão me perseguindo com mensagens e comentários: contatos insistentes, inclusive por diferentes perfis.
5. Estão incentivando outras pessoas a me atacar: grupos ou publicações que estimulam ataques contra mim.

O usuário aprovou essas cinco opções e a seleção de mais de uma resposta. As dimensões do aprofundamento foram aprovadas abaixo; perguntas concretas e pesos ainda precisam ser definidos.

### Ameaças: opções aprovadas

1. Disseram que vão me machucar.
2. Ameaçaram divulgar algo particular meu.
3. Disseram que vão me encontrar ou me perseguir fora da internet.
4. Ameaçaram alguém próximo de mim.
5. Estão me ameaçando para me obrigar a fazer algo.

A seleção múltipla foi aprovada junto com essas opções.

### Vazamento de conteúdo particular: opções aprovadas

1. Compartilharam fotos ou vídeos meus sem minha autorização.
2. Divulgaram conversas, áudios ou capturas de tela particulares.
3. Espalharam meus dados pessoais, como telefone, endereço ou localização.
4. Divulgaram conteúdo íntimo meu.
5. Entraram na minha conta e expuseram informações minhas.

A proposta aprovada permite seleção múltipla e relato de conteúdo íntimo sem precisar anexá-lo.

### Perfil falso ou página de fofoca: opções aprovadas

1. Criaram um perfil fingindo ser eu.
2. Usaram meu nome ou minha imagem em uma página de fofoca.
3. Publicaram boatos ou acusações sobre mim.
4. Criaram enquetes, rankings ou comparações para me constranger.
5. Usam um perfil ou uma página para expor e atacar outras pessoas da escola.

A seleção múltipla foi aprovada junto com essas opções.

### Golpe: opções aprovadas

1. Tentaram me convencer a enviar dinheiro ou fazer um pagamento.
2. Pediram minha senha, código de acesso ou dados pessoais.
3. Enviaram um link ou arquivo suspeito para eu abrir.
4. Fingiram ser alguém ou alguma organização em que confio.
5. Ofereceram uma compra, prêmio, vaga ou oportunidade que parece falsa.

A seleção múltipla foi aprovada junto com essas opções. Foi proposta a investigação posterior de pagamento, compartilhamento de dados e perda de acesso à conta; as perguntas e respostas específicas ainda não foram definidas.

## Aprofundamento do questionário aprovado

Perguntas adaptadas à opção escolhida, cobrindo cinco dimensões:

1. Quando aconteceu e se continua acontecendo.
2. Com que frequência acontece.
3. Quem teve acesso ou quantas pessoas estão envolvidas.
4. Quais consequências já ocorreram.
5. Se existe risco ou pressão neste momento.

Exibir apenas perguntas relevantes às seleções. Incluir “Não sei” quando fizer sentido. Perguntas, alternativas e pesos individuais ainda precisam ser detalhados.

## Regras da coordenação definidas na entrevista

- Responsabilidade compartilhada pela equipe, sem responsável individual obrigatório.
- Exibir a última pessoa que acessou o caso e quando acessou.
- Registrar separadamente a autoria das ações, mensagens, notas e mudanças de status.
- Permitir alteração manual da prioridade, com justificativa; preservar classificação original e autoria da alteração no histórico.
- Foram propostas as faixas crítica, alta, média e baixa, motivos visíveis da classificação e alertas independentes da soma de pesos. A resposta do usuário confirmou explicitamente a alteração manual; as regras concretas de cálculo e alertas permanecem por definir.
- Status escolhidos explicitamente: Novo, Em investigação e Resolvido.
- Acolhimento e providências ficam registrados durante a investigação, sem status adicionais.
- Encerramento: situação solucionada ou intervenção realizada, com registro de dados sobre as providências.
- Campos sugeridos para o encerramento: descrição das providências, data, resultado observado, autoria automática e anexos opcionais. O usuário ainda não confirmou os campos individualmente.

## Acompanhamento após a resolução aprovado

- O caso permanece resolvido; o aluno é direcionado a uma área de acompanhamento após a resolução, vinculada ao histórico.
- Nessa área o aluno pode conversar com a equipe e informar se a situação melhorou ou voltou a acontecer.
- O usuário confirmou essas funções. A equipe recebe o alerta descrito abaixo; não foi definido acompanhamento periódico automático.

## Decisões posteriores e revisão visual

- Ao informar que a situação voltou, o painel deve avisar que a intervenção anterior não teve resultado permanente e sugerir reavaliação e medidas mais efetivas.
- O alerta fica destacado até a equipe registrar a revisão; registrar quem revisou e quando.
- Coordenação usa principalmente computador.
- O usuário escolheu explicitamente a versão acolhedora para a coordenação: “Acolhedora ganhou”. A alternativa sóbria foi descartada.
- Prévia aprovada da coordenação em `/revisao.html`.
- Escopo dos protótipos: visão geral, casos, detalhe com conversa/notas/histórico, alteração justificada de prioridade, registro de resolução, pós-resolução e revisão de recorrência.
- São demonstrações locais com dados fictícios em memória. As prioridades dos exemplos são ilustrativas; não implementam o cálculo definitivo dos questionários. Os portais existentes permanecem disponíveis.

## Direção visual escolhida para a coordenação

Acolhedora: tons suaves de verde, fundo claro e quente, respiro entre grupos, títulos com presença editorial e linguagem humana. Preservar a clareza de prioridades, alertas, status, histórico e ações de equipe demonstrada no protótipo. Uso principalmente no computador.

A coordenação seguirá a identidade acolhedora. O portal do aluno terá a direção jovem e expressiva, escolhida na comparação posterior.

## Direção visual escolhida para o aluno

O usuário escolheu explicitamente a versão jovem e expressiva: “Jovem e expressiva ganha”. Prévia em `/aluno-revisao.html`.

Mostra início, situações e desdobramentos aprovados, relato, confirmação, conversa e acompanhamento após resolução com exemplos locais. O aprofundamento adaptativo e o cálculo de pesos não estão implementados nesta prévia visual.

Adotar ameixa e pêssego, títulos marcantes, linguagem próxima e acolhedora, sem infantilizar o público de 15 a 21 anos. Preservar a clareza do anonimato, das etapas e do acompanhamento. **Uso no celular e no computador**, confirmado pelo usuário.

## Limpeza

Removidos os seletores e alternativas visuais rejeitadas: coordenação sóbria e aluno na identidade acolhedora da coordenação. Este documento substitui `redesenho-entrevista.md`. Mapa, índice, bases funcionais e testes continuam úteis e foram preservados. Os arquivos compilados são regenerados pelos builds.
