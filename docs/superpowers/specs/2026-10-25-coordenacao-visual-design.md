# Visual da coordenação: página do caso, fila, barra lateral, Mapa e Relatórios

Data: 25/10/2026. Subprojeto 3 de 3 do pedido de melhorias do MVP (1: editar e excluir mensagens; 2: portal do estudante; ambos concluídos).

## Objetivo

A equipe da coordenação encontra e trata um caso com menos rolagem e menos ruído, no computador e no celular, sem perder nenhuma informação nem a identidade visual atual.

## Situação atual (auditoria no Chrome real, 25/10/2026, 14 casos de teste, 96 capturas em 375, 768 e 1280 px)

- Barra lateral: o fundo metálico (`MetalLiquido`, SVG 248x900) termina em 800 px de altura e a barra fica cortada em janelas mais altas. No celular o cabeçalho ocupa cerca de 240 px antes do conteúdo, e a navegação e as abas cortam itens ("Notas intern…").
- Fila de casos: 6.910 px em 375 px, cartões de cinco a seis linhas e um botão "Abrir" por caso.
- Página do caso: coluna longa e plana (link ROE em azul padrão do navegador, "Dados do caso", status, "Organização do atendimento", presença, abas, e "Por que esta prioridade?" no fim). Os estados vazios ("O aluno não respondeu ao questionário", "Sem anexos") ocupam o mesmo espaço que conteúdo. Na conversa, Editar e Excluir se repetem em cada mensagem. O formulário "Resolver" chega a 3.305 px em 375.
- Mapa: o mapa vazio é um bloco azul com rótulo minúsculo, sem pista do que fazer. Relatórios: a tabela tem 383 px em 375 (rolagem horizontal); com um único dia de dados o gráfico parece quebrado.

## Decisões do usuário (25/10/2026)

- Foco: **página do caso**, **fila de casos** e **barra lateral, Mapa e Relatórios**. O celular entra como parte de cada tela. Desenho aprovado.
- **Preservar o visual**: tema Fluent atual (azul `#0f6cbd`, Segoe UI Variable, bordas finas, o fundo metálico animado da barra e o botão "Pausar efeito"). Nenhuma cor, fonte ou variável CSS nova; só composições dos tokens de `coord.css` e `fluent.css`.

## Fora de escopo

Backend e contratos de API (nenhuma mudança); telas Visão geral, Usuários, Ensaio, Login e Setup (só herdam a nova barra lateral); tema escuro; novas métricas; o formulário de resolução (só a posição do botão "Resolver este caso"); regras de negócio da fila e da prioridade.

## Barra lateral e casca

1. A coluna lateral ocupa a altura inteira da janela em telas de 760 px ou mais (`position: sticky; top: 0; height: 100dvh`), com o `MetalLiquido` cobrindo toda a altura (`preserveAspectRatio` já é `slice`; o contêiner passa de altura fixa para 100%). Rodapé da barra: sessão, "Sair" e "Pausar efeito" fixos embaixo.
2. Abaixo de 760 px a barra vira uma faixa superior com: marca à esquerda, nome da sessão e "Sair" à direita, e a navegação logo abaixo em uma linha rolável. Meta de altura do cabeçalho em 375 px: **até 130 px** (hoje cerca de 240 px). O item atual sempre fica visível (rola o contêiner ao montar e ao trocar de tela). O nome da tela atual aparece no `h1`, não duplicado no cabeçalho.
3. Alvos de toque de 44 px de altura mínima na navegação e nos botões do cabeçalho.

## Fila de casos (`Fila.tsx`, usada em Casos, Meu atendimento e Pós-resolução)

1. **Linha compacta** (celular e telas abaixo de 960 px): linha 1 com selo de prioridade, assunto (botão focável que abre o caso), selo "N mensagens novas" quando houver e status; linha 2 com o resumo em uma linha, cortada com reticências; linha 3 em texto pequeno com responsável, próxima ação com prazo e último acesso; motivos de atenção como selos pequenos ao lado do assunto (no máximo dois, o restante em "+N"). Selos raros ("Acolhimento anônimo", "Ocorrendo agora", "Simulação", "Aluno voltou a pedir ajuda", "Sem primeiro acesso há mais de 24 horas") continuam, em linha que quebra. A linha inteira abre o caso ao clique (`onClick` na `tr`), e o botão "Abrir" some; o assunto continua sendo o controle de teclado e leitor de tela (`aria-label` "Caso {id}. Abrir.").
2. **Desktop (960 px ou mais)** mantém a tabela com cabeçalhos e as mesmas colunas, mais densa (padding de linha reduzido), com a coluna "Último acesso" mantida e o botão "Abrir" removido.
3. **Filtros**: as visões ("Todos", "Ainda não abertos", "Precisam de atenção", "Resolvidos" e as de "Meu atendimento") ficam numa faixa rolável de uma linha; busca e "Conversa" ao lado; "Filtros detalhados" continua recolhível, com a contagem de filtros ativos no resumo. Textos de ajuda longos (`filtros-ajuda`) vão para dentro do recolhível.
4. Mantém os avisos ao vivo (`role="status"`), o anúncio de casos novos e a ordem atual (prioridade e depois mais antigo).
5. Meta medida em 375 px com os 14 casos de teste: **fila até 1.700 px** (hoje 6.910), cada caso com cerca de 110 px.

## Página do caso (`Caso.tsx`, `Conversa.tsx`, `Atendimento.tsx`)

1. **Cabeçalho**: botão "Voltar aos casos", `h1` "Caso N: assunto", selos (prioridade, status, canal, "Ocorrendo agora"), data de recebimento e tipo de denúncia em uma linha de texto pequeno. A presença ("admin: vendo o caso") fica na mesma faixa.
2. **Barra de ações** logo abaixo: Status (select) e "Reavaliar prioridade" à esquerda; à direita **Exportar para o ROE** (hoje link solto; vira botão secundário com a nota "Relatório de apoio. Confira os campos ao preencher" em `title` e na ajuda recolhida) e **Resolver este caso** (botão principal, que abre o painel de resolução já existente). Quando o caso está resolvido, a barra mostra "Reabrir para investigação" no lugar.
3. **Organização do atendimento** vira uma linha ("Responsável: X · Próxima ação: Y até DD/MM") com o botão "Editar responsável e ação"; o formulário abre no lugar (comportamento atual).
4. **Dados do caso** continua recolhível, agora com indicador +/- (mesmo padrão do portal do aluno, hífen simples).
5. **Layout de duas colunas a partir de 1100 px**: coluna principal com as abas; coluna lateral fixa (sticky) com "Por que esta prioridade?" (motivos, prioridade atual e original). Abaixo de 1100 px o painel aparece como bloco recolhível aberto por padrão para prioridade crítica ou alta, fechado para as demais.
6. **Abas**: rótulos com contadores ("Conversa 8", "Notas internas 2", "Histórico 12") e um ponto de mensagem nova quando `mensagens_novas > 0`; em telas estreitas o contêiner rola e a aba selecionada rola para dentro da vista, sem cortar nomes. Navegação por setas, Home e End, `role="tab"` e `aria-controls` mantidos.
7. **Estados vazios compactos**: "O aluno não respondeu ao questionário." e "Sem anexos." passam a uma linha de texto secundário sem título grande (os `h2` só aparecem quando há conteúdo, ou ficam visualmente ocultos).
8. **Conversa**: Editar, Excluir e Ver versões de cada mensagem ficam dentro de um menu "⋯" (botão `aria-haspopup="menu"`, itens `role="menuitem"`, Esc fecha e devolve o foco, setas navegam); o comportamento de edição e exclusão da spec de 22/10/2026 não muda. Marcas "(editada)" e "Mensagem apagada" permanecem. O campo de nova mensagem fica fixo no rodapé da área de rolagem em telas de 760 px ou menos (mesmo cuidado com altura do portal do aluno).
9. Resolução: o painel "Resolver este caso" não muda por dentro; em 375 px ganha títulos de seção e espaçamento para reduzir a altura percebida, sem remover campos.

## Mapa e Relatórios

- **Mapa vazio** (`mapa/Mapa.tsx`, `mapa.css`): em vez do bloco azul, um cartão com título "A planta ainda está vazia", uma frase que explica o primeiro passo ("Adicione uma ala ou um ambiente para começar") e o botão que já existe para adicionar, com foco no primeiro campo ao abrir. Quando há ambientes e nenhum nível visível, texto curto e o seletor de nível em destaque. Legenda e rótulos do mapa em 14 px no mínimo.
- **Relatórios** (`Relatorios.tsx`): abaixo de 600 px a tabela vira lista empilhada (cada linha um cartão com rótulo: valor), sem `overflow-x`; o gráfico mostra a nota "Ainda há pouco histórico: só existem dados em N dia(s) neste período." quando houver menos de 3 pontos, em vez de parecer quebrado. Rótulos de eixo em 12 px no mínimo.

## Acessibilidade e privacidade

- Todos os papéis ARIA atuais permanecem (tabela da fila, tablist, regiões ao vivo, `role="status"` e `role="alert"`).
- Linha clicável da fila nunca é a única forma de abrir um caso. Menu "⋯" com foco gerenciado e fechamento por Esc ou clique fora.
- `prefers-reduced-motion`: sem animação nova; o efeito metálico continua pausável.
- Nenhum dado novo é exibido; o conteúdo que a equipe vê hoje continua o mesmo (só reorganizado).

## Arquivos

Modificar: `frontend/src/coord/App.tsx`, `Navegacao.tsx`, `MetalLiquido.tsx`, `Fila.tsx`, `Caso.tsx`, `Conversa.tsx`, `Atendimento.tsx`, `Relatorios.tsx`, `mapa/Mapa.tsx`, `mapa/mapa.css`, `coord.css`, `fluent.css`, `motion.css`, `atendimento.css`. Testes: `App.test.tsx`, `Fila.test.tsx`, `Caso.test.tsx`, `Conversa.test.tsx`, `Relatorios.test.tsx`, `mapa/Mapa.test.tsx`, `portal.test.tsx`, `polimento.test.tsx`, `Antislop.test.tsx`, `Atendimento.test.tsx`, e `testes/servidor.ts` se um mock mudar. Scripts e docs que citam textos alterados (`frontend/verificacao/*.mjs`, `docs/*.md`) são atualizados na tarefa de fechamento. Extrair componentes (por exemplo `LinhaCaso`, `MenuMensagem`, `BarraAcoes`) é permitido quando um arquivo passar de cerca de 300 linhas, sem mudar as interfaces públicas.

## Testes e verificação

- TDD: testes novos antes do código. Fila: linha compacta (assunto como botão, clique na linha abre, "+N" nos motivos, ausência do botão "Abrir"), filtros recolhíveis com contagem. Caso: barra de ações, ROE como botão, contadores nas abas, estados vazios sem título, painel lateral e recolhível, menu "⋯" da conversa (teclado, Esc, foco). Casca: item atual visível, cabeçalho compacto. Relatórios: lista empilhada em largura estreita e nota de pouco histórico. Mapa: estado vazio com chamada.
- Suítes completas da coordenação e do aluno (`--maxWorkers=1`), `build:coord` e `build:aluno`. Backend não muda.
- Chrome real (Playwright, banco temporário, portas 3100/4100, nunca `C:\ProgramData`) em 375, 768 e 1280 com os mesmos 14 casos de teste: altura da fila (meta até 1.700 px em 375), altura do cabeçalho (meta até 130 px), ausência de rolagem horizontal (inclusive Relatórios), barra lateral em altura total em janelas de 1280x1100, foco e teclado (abas, menu "⋯", linha da fila), todas as capturas lidas e comparadas com as de `scratchpad/verif3-shots`.

## Riscos

- Muitos testes citam rótulos e estruturas atuais (cerca de 20 arquivos de teste da coordenação): a mudança é guiada por testes, e cada tarefa atualiza os seus.
- O efeito metálico em altura total pode pesar em máquinas fracas: o botão "Pausar efeito" e a pausa com a aba oculta continuam.
- Linha clicável e menu "⋯" são pontos clássicos de falha de teclado e leitor de tela: verificação específica no Chrome real e testes de foco.
- Custo se o desenho estiver errado: retrabalho só de front, sem dados nem API envolvidos.
