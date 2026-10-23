# Portal do aluno

React, Vite e TypeScript. API em mesma origem, com código de acompanhamento somente no corpo de requisições POST. Sem roteador ou código de caso em URLs.

### Acolhimento e conversas (20/10/2026)

O início oferece "Conversar sem me identificar" (acolhimento anônimo direto), sem questionário ou dados escolares. A primeira mensagem abre o atendimento por `POST /api/acolhimento`. Os acessos criados/consultados ficam no histórico local `tetra-guard.acessos.v1` (somente código e marcador de leitura), com remoção individual ou de todos. Esse histórico é separado do rascunho.

O acompanhamento foca a conversa e destaca respostas novas. A coordenação pode filtrar estados de conversa, ver prévias e exportar um relatório de apoio ao preenchimento manual do ROE. A leitura da equipe é por usuário e registrada apenas na aba Conversa visível. Veja o [guia de uso](../docs/acolhimento-e-conversas.md) e a [validação](../docs/validacao-acolhimento-frontend.md).

```powershell
cd frontend
npm install
npm test
npm run build:aluno
```

O build gera `../backend/app/static/aluno/index.html` e `assets/`. Sirva essa pasta na raiz da origem do portal, como faz a rota SPA do backend. O desenvolvimento com `npm run dev` encaminha `/api` para `127.0.0.1:3000`.

O tema segue `docs/design/tokens.md` e `prefers-color-scheme`. A fonte é empacotada por `@fontsource/atkinson-hyperlegible`, conforme o brief específico desta tarefa. O pacote tem pesos 400 e 700; a interface usa esses dois pesos.

**Divergência com `docs/design/tokens.md`:** o documento pede "Atkinson Hyperlegible Next" nos pesos 400, 600 e 700. Usamos "Atkinson Hyperlegible" (pacote `@fontsource/atkinson-hyperlegible`, que não traz o peso 600 nem a família Next), então todo texto que o design marca com 600 sai em 700. Se a Next for empacotada depois, basta trocar a dependência e o `--fonte` em `tema.css`. Não depende de Google Fonts, CDN, estilos inline ou scripts inline.

### Telas e passos v3

1. **Início**: abertura curta e três cartões de ação (Preciso de ajuda, Conversar sem me identificar, Ver meu caso com o campo Código de acompanhamento), linha de privacidade, bilhete e blocos recolhíveis "Como funciona" e "Seus dados e privacidade". Com acessos salvos, aparece antes o cartão "Continuar meu caso". O consentimento explica o funcionamento na LAN e os registros da rede, sem prometer anonimato total.
2. **Pedido**: oito grupos colapsáveis, seleção múltipla entre grupos e contagens; perguntas comuns e relacionadas, uma por tela; relato; revisão editável, provas opcionais e identificação.
3. **Confirmação**: código de acompanhamento para guardar e copiar.
4. **Acompanhar**: conversa em formato de chat (separador único "Novas mensagens", código recolhido em "Seu código", botão "Atualizar conversa" só quando a conexão cai ou a leitura falha, resposta fixa no rodapé), resolução e pós-resolução. O aluno nunca recebe prioridade, autoria da equipe ou notas internas.

O App principal usa `src/aluno/Pedido.tsx` e a definição pública `GET /api/v3/questionario`, com tempo limite de 8 segundos. Falha ou definição malformada permite seguir só com o relato. `fluxoV3.ts` une perguntas por ID: perguntas citadas nas opções são raízes diretas; `mostrar_se` usa OU entre alternativas alcançadas; `mostrar_se_todas` exige todas as alternativas. `para_opcoes` limita raízes e descendentes aos temas selecionados. Ao fechar um ramo, suas respostas são eliminadas.

O catálogo tem 85 perguntas (65 novas), com caminhos próprios para cada uma das 29 opções e quatro perguntas comuns. Cyberbullying distingue mensagens, boatos, imagens/montagens, exclusão e ameaças, com canal e aprofundamentos condicionais. A interface mostra o assunto da pergunta. Consulte a [matriz dos caminhos](../docs/bifurcacoes-por-tema.md) e a [verificação](../docs/verificacao-bifurcacoes.md). Novas respostas descritivas têm peso zero. Definições personalizadas anteriores continuam válidas sem os novos campos. Respostas e rascunho admitem até 400 IDs no total; o JSON enviado admite 64 KiB.

O multipart `POST /api/v4/denuncias` envia `envio_id` (32 hex), relato e campos existentes, anexos e `respostas` JSON `{versao:3,marcadas,respostas}`. Exige `ano_relator` e `sala_relator`, inclusive sem nome, e aceita `local_id` e `local_outro`. Esses campos integram o recibo de deduplicação. O relato tem de 10 a 5000 caracteres. O recibo fica em memória até começar outro pedido, inclusive quando há edição após falha de rede; conteúdo diferente com recibo já recebido gera conflito 409, sem duplicar o caso. Respostas rejeitadas nunca geram reenvio silencioso: o aluno precisa confirmar o botão “Confirmar envio sem respostas”. Somente uma rejeição 400 definitiva permite novo recibo para esse envio confirmado; a escolha e o recibo permanecem nos retries seguintes. Navegação e saída da página ficam bloqueadas durante o envio; o envio aguarda o giro das imagens. Clientes v2/v3 continuam aceitos pelas rotas anteriores.

**Turma e localização.** `GET /api/locais` entrega somente nomes e hierarquia dos ambientes. O aluno escolhe o caminho no catálogo ou descreve outro local, sem bloquear o pedido quando a planta está vazia ou indisponível. Ano e sala são da turma de quem relata; não são a sala física da ocorrência. Os campos acompanham o rascunho de 24 horas e permanecem quando o aluno escolhe enviar sem nome. A revisão explica que turma e conteúdo podem permitir reconhecimento.

### Mapa e autoria na coordenação

A aba Mapa da escola (`#mapa`) começa vazia. Cada nível admite alas, andares, salas e áreas comuns em retângulo ou em L. O formato em L permite rotação de 0/90/180/270 graus e espessura dos braços de 15% a 85% de cada dimensão. Há desenho com ponteiro, criação por formulário, movimentação, tamanho, nome, desfazer, cancelamento, busca, zoom e navegação entre níveis. A planta salva usa revisão; um conflito preserva o rascunho. O desenho não salvo permanece ao navegar entre abas e é descartado ao sair da conta. Ambientes com filhos ou casos vinculados têm exclusão protegida. Limites: 500 ambientes e seis níveis. A área inicial de 1200 × 800 unidades pode crescer até 12000 × 8000 por nível com os botões Ampliar para a direita/baixo. A área visível tem rolagem nos eixos necessários; as barras desaparecem quando o conteúdo cabe ao afastar o zoom. As dimensões salvas são reconstruídas a partir dos ambientes, sem alterar as coordenadas existentes.

### Organização do atendimento

Casos oferece os recortes Todos, Ainda não abertos, Precisam de atenção e Resolvidos, com contagens e filtro por motivo. Não aberto significa que ninguém consultou o detalhe; isso é independente do status. A atenção reúne casos abertos sem responsável ativo ou sem primeira mensagem da coordenação, mensagens do aluno sem resposta, ações vencidas e recorrências. Um resolvido também entra na atenção quando tem mensagem pendente, ação vencida ou recorrência.

No detalhe, Organização do atendimento permite atribuir um usuário ativo e registrar uma próxima ação com data, inclusive para acompanhamento de resolvidos. A data vale até o fim do dia em Brasília; a fila atualiza ao mudar o dia, mesmo com SSE online. Concluir ação limpa a pendência e mantém o registro no histórico. Para retirar uma ação sem concluí-la, limpe texto e data e salve. Alterações simultâneas exigem conferência sem apagar o rascunho. Esses dados e o histórico de atribuições são internos; o acompanhamento do aluno não os recebe.

A migração cria `seguranca.db.pre-atendimento.bak` antes de acrescentar campos a bancos existentes. Casos antigos começam sem atribuição ou ação automática. A cópia anterior é preservada nas próximas inicializações.

Filtros por período, ano/sala e base da turma do relator ou autores apurados contam casos, não pessoas. Simulações não entram. O ambiente mostra também seus descendentes; a distribuição por ano/turma pode ter grupos sobrepostos quando há vários autores. Casos sem autoria identificada ficam fora dessa base e aparecem em contador separado.

A finalização usa `POST /api/v4/casos/<id>/resolucao` multipart, com `X-SI-Coord: 1`, mantendo a revisão do caso. Até dez autores têm nome, ano e sala obrigatórios, foto opcional PNG/JPEG/WebP de até 5 MiB. A alternativa de autoria não identificada exige justificativa interna. Esses dados são internos e não integram os textos de providências/resultado visíveis ao aluno; a foto é servida apenas na rota autenticada da coordenação.

**Rascunho.** `si-aluno-pedido-v3` expira 24 horas após a última edição. Abrir ou validar contra a definição não renova o prazo. As chaves legadas são descartadas com aviso. A allowlist guarda somente texto, escolhas, respostas e identificação escolhida; não guarda código, recibo, imagens ou conversa. Há aviso quando o storage está bloqueado. Imagens permanecem em memória e são revogadas ao remover/sair.

**Imagens e identificação.** Até cinco imagens de 5 MB, PNG/JPEG/WebP/GIF, com giro de 90 graus exceto GIF. Ao escolher anonimato, nome e turma são apagados. “Não” e “Não tenho certeza” na pergunta de segurança mostram orientação imediata.

Os módulos v2 continuam em `Denuncia.tsx`, `fluxo.ts` e `rascunho.ts`, com a casca `src/preview/AppV2.tsx` para suas prévias e testes. Eles não são importados pelo App principal v3.

## Verificação em navegador

Rode os builds sequencialmente e depois a suíte: a checagem CSP lê os arquivos gerados e não deve disputar o `emptyOutDir` do Vite.

```powershell
npm.cmd run build:aluno
npm.cmd run build:coord
npm.cmd test
npm.cmd run contraste
node verificacao/v3-lan.mjs
```

A rodada v3 exige Chrome instalado e um backend **de teste** em loopback com pasta de dados fictícios e limites desligados. Padrão: portas 23000/24000; variáveis opcionais `SI_ALUNO` e `SI_COORD`. O script cria ou usa uma conta fictícia pelo primeiro acesso e guarda a credencial na pasta ignorada `.superpowers/sdd/2026-10-16-v3-lan/test-credentials.json`.

Em 375, 768 e 1280 px, claro/escuro, verifica: teclado; seleção entre grupos; segurança; dinheiro e troca para intimidade com limpeza; relato e edição; imagem e giro; envio anônimo real; código; conversa; filtros e detalhe autenticados da coordenação. Confere CSP, recursos externos, estilos inline, controles de 44 px e ausência de rolagem horizontal. Capturas e resultados ficam em `.superpowers/sdd/2026-10-16-v3-lan/task-2-capturas/` e `task-2-browser.json`.

Os scripts anteriores `navegador.mjs` e `aluno.mjs` descrevem o percurso legado e permanecem como referência da v2. Não são a verificação do App v3.

## Portal da coordenação

```powershell
npm run build:coord
npm run dev:coord
```

O build gera `../backend/app/static/coordenacao/index.html`. `npm test` roda as suítes dos dois portais, sem navegador. A verificação em Chrome real da coordenação é `verificacao/coordenacao.mjs` (precisa de `SI_COORD_URL`, `SI_ALUNO_URL` e `SI_COORD_SENHA`).

### Telas e endereços

A casca tem navegação lateral (barra superior rolável abaixo de 760 px). O endereço guarda só o número do caso, nunca texto de caso nem nome de pessoa.

| Tela | Endereço | Observação |
| --- | --- | --- |
| Visão geral | `/coordenacao.html` | Contagens por status e prioridade, casos que pedem atenção e atalhos para Casos já filtrados |
| Casos | `#casos` | Busca (até 100 caracteres) e filtros de status, prioridade e tipo; mostra motivos e último acesso |
| Pós-resolução | `#pos-resolucao` | Casos resolvidos; os com recorrência pendente ganham destaque e entram no contador da navegação |
| Caso | `#caso-ID` | Status, reavaliação justificada da prioridade, registro de resolução, revisão de recorrência e as abas Relato, Conversa, Notas internas e Histórico |
| Usuários | `#usuarios` | Só para administrador: lista com papel (Administrador ou Coordenação), criar e desativar |
| Ensaio | `#ensaio` | Carregar e remover os casos de simulação, com confirmação para remover |

Login e Primeiro acesso também usam o tema. O vocabulário é o da v2: status `novo`, `em_investigacao` e `resolvido`; prioridade `critica`, `alta`, `media` e `baixa`. Providências e resultado da resolução são rotulados "Visível para o aluno".

### Tema

O visual vem de `src/coord/coord.css`, escopado em `.coord-app`, que redefine os tokens de `src/shared/tema.css` (o portal do aluno não muda). Só tokens: sem cor fixa, estilo inline ou CDN, por causa da CSP. Todo par novo de cores entra em `verificacao/contraste.mjs`.

### Como verificar

```powershell
npx vitest run --config vite.coord.config.ts
npx vitest run --config vite.aluno.config.ts
npx tsc --noEmit
npm run contraste
npm run build:coord
```

A prévia de revisão (`interfaces.html`, código em `src/preview`) usa o mesmo tema e dados fictícios no formato da v2. Para olhar as telas em 375, 768 e 1280 px e nos temas claro e escuro, suba `npm run dev` e abra `/interfaces.html`.

O `csp.test.ts` varre o código-fonte dos dois portais. Se a pasta de build existir (`backend/app/static/aluno` ou `coordenacao`), o `index.html` gerado precisa existir e passa pela mesma checagem. Sem pasta de build, essa parte é pulada: rode os dois builds antes do teste para valer.

## Contraste

`npm run contraste` calcula a razão de contraste WCAG (luminância relativa) dos pares de `src/shared/tema.css` nos dois temas e sai com erro se algum ficar abaixo do mínimo: 4,5:1 para texto, 3:1 para bordas, pontos de status e anel de foco. Última medição: nenhuma falha.

| Par (primeiro plano sobre fundo) | Mínimo | Claro | Escuro |
| --- | --- | --- | --- |
| texto-principal sobre fundo-base | 4.5:1 | 14.50 | 15.47 |
| texto-secundario sobre fundo-base | 4.5:1 | 6.59 | 8.55 |
| primaria-base sobre fundo-base | 4.5:1 | 6.95 | 9.67 |
| perigo-base sobre fundo-base | 4.5:1 | 6.37 | 7.71 |
| borda-forte sobre fundo-base | 3:1 | 3.40 | 4.19 |
| foco-anel sobre fundo-base | 3:1 | 5.32 | 8.35 |
| texto-principal sobre fundo-superficie | 4.5:1 | 16.08 | 14.06 |
| texto-secundario sobre fundo-superficie | 4.5:1 | 7.30 | 7.77 |
| primaria-base sobre fundo-superficie | 4.5:1 | 7.71 | 8.79 |
| perigo-base sobre fundo-superficie | 4.5:1 | 7.07 | 7.01 |
| borda-forte sobre fundo-superficie | 3:1 | 3.77 | 3.81 |
| foco-anel sobre fundo-superficie | 3:1 | 5.90 | 7.59 |
| texto-principal sobre fundo-superficie-2 | 4.5:1 | 13.26 | 12.33 |
| texto-secundario sobre fundo-superficie-2 | 4.5:1 | 6.02 | 6.81 |
| primaria-base sobre fundo-superficie-2 | 4.5:1 | 6.36 | 7.71 |
| perigo-base sobre fundo-superficie-2 | 4.5:1 | 5.83 | 6.15 |
| borda-forte sobre fundo-superficie-2 | 3:1 | 3.11 | 3.34 |
| foco-anel sobre fundo-superficie-2 | 3:1 | 4.87 | 6.66 |
| texto-sobre-primaria sobre primaria-base | 4.5:1 | 7.71 | 8.79 |
| texto-sobre-primaria sobre primaria-hover | 4.5:1 | 9.99 | 10.28 |
| texto-sobre-perigo sobre perigo-base | 4.5:1 | 7.07 | 7.57 |
| texto-principal sobre primaria-suave | 4.5:1 | 13.52 | 11.12 |
| texto-secundario sobre primaria-suave | 4.5:1 | 6.14 | 6.14 |
| primaria-base sobre primaria-suave | 4.5:1 | 6.49 | 6.95 |
| perigo-base sobre perigo-suave | 4.5:1 | 6.07 | 6.50 |
| texto-principal sobre perigo-suave | 4.5:1 | 13.80 | 13.05 |
| aviso-texto sobre aviso-fundo | 4.5:1 | 6.61 | 8.98 |
| sucesso-texto sobre sucesso-fundo | 4.5:1 | 5.90 | 7.97 |
| info-texto sobre info-fundo | 4.5:1 | 7.16 | 8.06 |
| gravidade-alta-texto sobre gravidade-alta-fundo | 4.5:1 | 6.47 | 8.22 |
| gravidade-media-texto sobre gravidade-media-fundo | 4.5:1 | 6.23 | 8.72 |
| gravidade-baixa-texto sobre gravidade-baixa-fundo | 4.5:1 | 6.92 | 8.26 |
| gravidade-alta-borda sobre gravidade-alta-fundo | 3:1 | 4.22 | 4.18 |
| gravidade-media-borda sobre gravidade-media-fundo | 3:1 | 3.17 | 4.57 |
| gravidade-baixa-borda sobre gravidade-baixa-fundo | 3:1 | 3.05 | 4.31 |
| gravidade-alta-borda sobre fundo-superficie | 3:1 | 4.99 | 4.56 |
| gravidade-media-borda sobre fundo-superficie | 3:1 | 3.60 | 5.38 |
| gravidade-baixa-borda sobre fundo-superficie | 3:1 | 3.57 | 4.93 |
| texto-principal sobre gravidade-alta-fundo | 4.5:1 | 13.61 | 12.90 |
| texto-secundario sobre gravidade-alta-fundo | 4.5:1 | 6.18 | 7.12 |
| foco-anel sobre gravidade-alta-fundo | 3:1 | 5.00 | 6.96 |
| foco-anel sobre primaria-suave | 3:1 | 4.96 | 6.00 |
| simulacao-texto sobre simulacao-fundo | 4.5:1 | 12.63 | 11.85 |
| simulacao-fundo sobre fundo-superficie | 3:1 | 12.63 | 11.70 |
| simulacao-fundo sobre gravidade-alta-fundo | 3:1 | 10.69 | 10.72 |
| desabilitado-texto sobre desabilitado-fundo | 4.5:1 | 4.93 | 4.62 |
| status-novo sobre fundo-superficie | 3:1 | 6.71 | 7.19 |
| status-novo sobre fundo-superficie-2 | 3:1 | 5.53 | 6.31 |
| status-em-analise sobre fundo-superficie | 3:1 | 7.71 | 8.79 |
| status-em-analise sobre fundo-superficie-2 | 3:1 | 6.36 | 7.71 |
| status-aguardando sobre fundo-superficie | 3:1 | 5.79 | 7.67 |
| status-aguardando sobre fundo-superficie-2 | 3:1 | 4.78 | 6.73 |
| status-encaminhado sobre fundo-superficie | 3:1 | 7.30 | 7.77 |
| status-encaminhado sobre fundo-superficie-2 | 3:1 | 6.02 | 6.81 |
| status-resolvido sobre fundo-superficie | 3:1 | 6.87 | 9.38 |
| status-resolvido sobre fundo-superficie-2 | 3:1 | 5.67 | 8.23 |
