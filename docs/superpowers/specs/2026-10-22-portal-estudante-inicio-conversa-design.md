# Portal do estudante: Início e Conversa

Data: 22/10/2026. Subprojeto 2 de 3 do pedido de melhorias do MVP (1: editar e excluir mensagens, concluído; 3: visual da coordenação, com spec própria).

## Objetivo

O estudante entende em poucos segundos o que pode fazer ao abrir o portal e, depois, conversa com a coordenação sem rolar por informações técnicas antes das mensagens.

## Situação atual (medida no Chrome, 22/10/2026)

- Início: 3.810 px de altura em 375 px de largura (mais de 4 telas). O primeiro botão só aparece depois de dois parágrafos. O guia "Como usar este canal", "Já conversou com a gente?", "Casos salvos" e "Antes de contar" repetem o que os passos já explicam.
- Conversa com 5 mensagens: 2.128 px em 375 px. Antes da primeira mensagem vêm três cartões de etapas empilhados, o código de acesso e o estado da conexão. Cada balão repete "Você" ou "Coordenação" e "Mensagem nova". O campo de resposta só aparece depois de toda a conversa.

## Decisões do usuário (22/10/2026)

- Foco: **tela inicial** e **conversa/acompanhamento**. Pedido de ajuda, confirmação e mapa ficam fora. "Casos salvos" não é tema próprio: só sobe para o topo do Início como cartão "Continuar meu caso", com os mesmos dados de hoje (código e marcador de leitura), sem mostrar estado do caso nem mensagem nova.
- Desenho aprovado: Início enxuto com três ações e blocos recolhíveis; Conversa em formato de chat compacto com campo de resposta fixo.
- **Preservar o visual**: identidade neobrutalista (bordas pretas, sombra dura, amarelo `#E1F200`, coral `#FF694F`), com as cores, fontes e variáveis de `aluno.css`. Nenhuma cor, fonte ou variável nova.

## Fora de escopo

Backend e contratos de API (nenhuma mudança); telas Pedido, Confirmacao, MapaLocal, Acolhimento (formulário de acolhimento anônimo); portal da coordenação; tema escuro (o portal só tem o claro); notificações; histórico de casos além do que já existe em `acessos.ts`.

## Início

Ordem na tela:

1. **Cartão "Continuar meu caso"**, só quando `lerAcessos()` devolve algum acesso. Lista cada acesso com **Abrir caso {código}** e **Apagar acesso {código}** (mesmos rótulos de hoje) e **Apagar todos os acessos** quando houver mais de um. Texto curto: "Neste aparelho. Apagar o acesso não apaga o caso na escola." O aviso de falha ao apagar (`avisoStorage`) continua.
2. **Abertura**: o mesmo `h1` "Você não precisa lidar com isso sozinho." e uma frase só: "Se algo está te preocupando, na escola, na internet ou em casa, conte para a coordenação. No seu tempo e sem precisar dizer seu nome."
3. **Três ações**, em cartões lado a lado a partir de 768 px e empilhados abaixo disso:
   - **Preciso de ajuda** (botão principal coral): abre o pedido, igual a hoje.
   - **Conversar sem me identificar** (botão secundário amarelo, antes "Quero acolhimento anônimo"): abre o acolhimento, igual a hoje. Legenda curta: "Sem questionário, nome, ano ou turma."
   - **Ver meu caso**: campo "Código de acompanhamento" com o botão **Acompanhar** no próprio cartão. Mesmas regras de hoje: erro "Digite seu código para acompanhar." e dica de que aceita minúsculas, espaços e sem hífen.
4. **Linha de privacidade sempre visível**, sob as ações: "A escola guarda o que você enviar para cuidar do caso. O nome é opcional."
5. **Bilhete** "Não precisa ter as palavras certas." mantido como está, depois das ações no celular e na coluna à direita da abertura em telas largas.
6. Dois blocos recolhíveis com `<details>`, fechados por padrão, no estilo dos `grupos-v3` já existentes:
   - **Como funciona**: o conteúdo do guia atual, em quatro parágrafos curtos (fazer um pedido, conversar sem se identificar, acompanhar e responder, voltar ao caso depois).
   - **Seus dados e privacidade**: os três parágrafos de "Antes de contar" sem alteração de sentido (relato, imagens e mensagens guardados; rede local e registros; rascunho por 24 h e aparelho compartilhado).

Metas medidas no Chrome: altura do Início em 375 px **até 1.900 px** com os blocos fechados e sem casos salvos (hoje 3.810); nenhuma rolagem horizontal em 375, 768 e 1280.

## Conversa (Acompanhar)

1. **Cabeçalho compacto**: `h1` "Acompanhar meu caso". As três etapas ficam sempre em linha (também em 375 px), cada uma com marca e nome. O estado ("Concluída", "Etapa atual", "Próxima") continua para leitores de tela, visualmente oculto. `aria-label="Etapas do caso"` e `aria-current="step"` na atual, como hoje.
2. **Código**: dentro de `<details>` "Seu código", fechado por padrão, com o código normalizado e "Anote em um lugar seguro." Aviso de armazenamento (`avisoStorage`) dentro do mesmo bloco, ou logo acima se o armazenamento falhou (para o aluno não perder o aviso).
3. **Conexão**: some o texto "Atualizações ao vivo". Quando a conexão não está `online`, aparece uma linha pequena "Reconectando; atualização a cada 8 segundos" e o botão **Atualizar conversa**. Online, o botão não é exibido.
4. **Mensagens**: `role="log"`, `aria-live="polite"` e `aria-label="Mensagens do caso"` continuam.
   - Mensagens seguidas do mesmo autor formam um grupo; o nome ("Você" ou "Coordenação") aparece só na primeira do grupo. Cada mensagem mantém o horário pequeno.
   - "(editada)" e "Mensagem apagada" como hoje (spec de 22/10/2026, editar e excluir).
   - **Novas mensagens**: um único separador "Novas mensagens" antes da primeira mensagem nova da coordenação, no lugar do "Mensagem nova" em cada balão. O texto de `role="status"` com a contagem ("Uma mensagem nova da coordenação." / "N mensagens novas da coordenação.") continua, visualmente compacto.
   - Ao abrir e ao enviar uma resposta, a lista rola até o separador (se houver) ou até a última mensagem, sem mover o foco. O foco inicial continua no título "Conversa com a coordenação".
5. **Campo de resposta fixo no rodapé** do portal (`position: sticky; bottom: 0`, com `padding-bottom` de `env(safe-area-inset-bottom)`): `textarea` de 2 linhas que cresce até 6, contador "N de 2000" pequeno, botão **Enviar resposta**. Limite, validação ("Escreva uma resposta de 1 a 2000 caracteres.") e mensagens de envio iguais às de hoje. Com o teclado aberto no celular o campo continua visível; se a verificação mostrar sobreposição, o campo volta a ficar no fim da conversa (decisão registrada no relatório de verificação).
6. **Pós-resolução** (`PosResolucao`) permanece entre o cabeçalho e a conversa, sem mudanças.

Meta medida: com 5 mensagens em 375 px, o campo de resposta fica na primeira tela sem rolar a página.

## Arquivos

Modificar: `frontend/src/aluno/Inicio.tsx`, `frontend/src/aluno/Acompanhar.tsx`, `frontend/src/aluno/aluno.css` (classes novas só com variáveis existentes), `frontend/src/aluno/App.tsx` apenas se a navegação precisar (nenhuma mudança prevista). Testes: `Inicio.test.tsx`, `InicioAcessos.test.tsx`, `Acompanhar.test.tsx`, `TempoReal.test.tsx`, `App.test.tsx`. Scripts de verificação e prévias que citam rótulos antigos (`frontend/verificacao/*.mjs`, `frontend/src/preview/*`, `frontend/src/revisao-aluno/main.tsx`) e `docs/acolhimento-e-conversas.md` (o rótulo "Quero acolhimento anônimo" vira "Conversar sem me identificar"). `PRODUCT.md` só é alterado se citar o rótulo antigo.

Novos componentes só se um arquivo passar de cerca de 250 linhas: `Acompanhar.tsx` hoje tem 161 linhas e `Inicio.tsx`, 67; a extração de `ListaMensagens` e `CartaoAcessos` é permitida se necessária, sem mudar a interface pública (`<Acompanhar codigoInicial>` e `<Inicio onAjuda onAcompanhar onAcolhimento>`).

## Acessibilidade e privacidade

- `<details>/<summary>` nativos: teclado (Enter e Espaço) funciona sem script; `summary` com área de toque mínima de 44 px.
- Nada do conteúdo de privacidade é removido: só recolhido, mais a linha curta sempre visível.
- A tela de conversa continua sem exibir o código antes das mensagens, mas o código segue a um toque de distância e a `Confirmacao` continua mostrando-o ao criar o caso.
- Contraste: reutiliza as combinações atuais (texto `#101010` sobre `#FFFCF5`, `#E1F200` e `#FF694F`); qualquer combinação nova é checada com o verificador de contraste do projeto.
- `prefers-reduced-motion`: sem animação nova.

## Testes e verificação

- TDD: testes novos antes do código. Início: blocos fechados por padrão e abertos por teclado; cartão "Continuar meu caso" aparece primeiro só com acessos salvos; ações levam às mesmas telas; erro do código vazio; texto de privacidade completo presente no DOM. Conversa: agrupamento de autor, separador único "Novas mensagens", botão Atualizar só fora de `online`, código recolhido, campo de resposta presente com `position: sticky` e sem perder texto digitado ao receber mensagens, envio inalterado, marcas "(editada)" e "Mensagem apagada" preservadas.
- Suítes completas do portal do aluno e da coordenação (`--maxWorkers=1`), `build:aluno`, `build:coord`. Backend não muda: roda-se apenas o arquivo que cobre os assets estáticos, se houver.
- Chrome real, com API simulada ou backend em banco temporário, em 375, 768 e 1280: alturas medidas, sem rolagem horizontal, foco e teclado, teclado do celular simulado com viewport baixo (375x480).
- Verificação visual de cada captura (lida, não só medida), comparando com as capturas de antes em `scratchpad/aluno-hoje/`.

## Riscos

- Campo fixo e teclado do celular: mitigado pela verificação em viewport baixo e pelo recuo descrito acima.
- Recolher o guia pode esconder instrução que o estudante precisa: mitigado por manter a linha de privacidade e os três rótulos autoexplicativos; o guia continua a um toque.
- Renomear "Quero acolhimento anônimo" quebra scripts e testes que usam o texto: lista de arquivos acima; custo se algum ficar para trás é teste ou script falhando, sem efeito no usuário.
- Custo se o desenho estiver errado: retrabalho só de front, sem dados nem API envolvidos.
