# Portal do aluno

React, Vite e TypeScript. API em mesma origem, com código de acompanhamento somente no corpo de requisições POST. Sem roteador ou código de caso em URLs.

```powershell
cd frontend
npm install
npm test
npm run build:aluno
```

O build gera `../backend/app/static/aluno/index.html` e `assets/`. Sirva essa pasta na raiz da origem do portal, como faz a rota SPA do backend. O desenvolvimento com `npm run dev` encaminha `/api` para `127.0.0.1:3000`.

O tema segue `docs/design/tokens.md` e `prefers-color-scheme`. A fonte é empacotada por `@fontsource/atkinson-hyperlegible`, conforme o brief específico desta tarefa. O pacote tem pesos 400 e 700; a interface usa esses dois pesos.

**Divergência com `docs/design/tokens.md`:** o documento pede "Atkinson Hyperlegible Next" nos pesos 400, 600 e 700. Usamos "Atkinson Hyperlegible" (pacote `@fontsource/atkinson-hyperlegible`, que não traz o peso 600 nem a família Next), então todo texto que o design marca com 600 sai em 700. Se a Next for empacotada depois, basta trocar a dependência e o `--fonte` em `tema.css`. Não depende de Google Fonts, CDN, estilos inline ou scripts inline.

### Telas e passos

1. **Início**: apresentação, o botão "Preciso de ajuda", o campo para acompanhar por código e o aviso "Antes de contar" (inclui a orientação de usar dados móveis para anonimato total).
2. **Pedir ajuda**, em quatro passos: situação (Cyberbullying, Ameaças, Vazamento, Perfil falso, Golpe, Aliciamento ou Outros); desdobramentos (opções marcadas, só nas cinco situações que as têm); relato, quando, onde e "está acontecendo agora"; provas (até 5 imagens) e identificação (anônimo por padrão).
3. **Confirmação**: mostra o código de acompanhamento uma única vez, com botão de copiar.
4. **Acompanhar**: linha do tempo de três etapas (Recebido, Em investigação, Resolvido), conversa com a coordenação e, com o caso resolvido, a área pós-resolução.

As opções marcadas entram no texto do relato, depois do texto do aluno, num bloco `Situações marcadas:` com uma linha `- <opção>` por opção. O texto próprio precisa de pelo menos 10 caracteres; o relato final aceita até 5000.

**Rascunho de 24 horas.** O texto e as escolhas ficam em `si-aluno-rascunho-v2` e expiram 24 horas depois da última edição (abrir a tela não renova o prazo). A chave antiga `si-aluno-rascunho-v1` é apagada ao abrir. O rascunho é apagado no envio ou em "Limpar rascunho", e nunca guarda código, imagens nem conversa. Se o navegador bloquear o armazenamento, a tela avisa e segue sem rascunho. Anexos permanecem só em memória.

**Girar imagem.** No passo 4, cada imagem (exceto GIF) tem o botão "Girar", que gira 90 graus no próprio navegador antes do envio. Se a rotação falhar ou a imagem girada passar de 5 MB, a original continua anexada e uma mensagem explica. O envio fica bloqueado enquanto uma imagem gira.

**Pós-resolução.** Com o caso resolvido, o aluno vê o desfecho, as providências e o resultado (texto puro, nunca HTML) e responde "Melhorou" ou "Voltou a acontecer". "Voltou" sinaliza recorrência para a coordenação revisar. Se a coordenação reabrir o caso, o bloco some e a resolução antiga deixa de aparecer. O aluno nunca vê prioridade, autoria da equipe nem notas.

**Privacidade do código.** O código de acompanhamento só viaja no corpo de requisições `POST`. Não vai para a URL, para `localStorage` nem para `sessionStorage`, e a confirmação é o único lugar em que aparece.

## Verificação em navegador

Duas verificações, ambas com Chrome instalado. As capturas (`verificacao/capturas/`) e os `resultado*.json` são locais e não entram no commit.

**Com API simulada** (rápida):

```powershell
npm run build:aluno
npm run test:navegador
```

O script serve o build com a CSP do portal e uma API falsa, e percorre 375, 768 e 1280 px nos temas claro e escuro.

**Com o backend real** (`verificacao/aluno.mjs`): suba o servidor com uma pasta de dados temporária (portas altas e limites de taxa desligados no `config.json`), crie o administrador de teste pelo primeiro acesso da coordenação e rode:

```powershell
$env:SI_ALUNO_URL='http://127.0.0.1:23000'; $env:SI_COORD_URL='http://127.0.0.1:24000'
$env:SI_ADMIN_NOME='Admin Teste'; $env:SI_COORD_SENHA='<senha de teste>'
node verificacao/aluno.mjs
```

O script percorre, em 375, 768, 900, 1024 e 1280 px e nos dois temas: início, pedido completo (com desdobramentos, imagem girada e identificação anônima), confirmação com código, acompanhar por código, conversa, resolução registrada pela API da coordenação (com marcação HTML para provar o texto literal), pós-resolução, "Voltou a acontecer", recorrência vista pela coordenação e reabertura. Em cada combinação confere rolagem horizontal, violações de CSP, erros de console, foco visível e texto cortado. No fim, envia um pedido por situação com todas as opções marcadas e registra prioridade e motivos, para provar que as opções não elevam a triagem sozinhas. `SI_LARGURAS`, `SI_TEMAS` e `SI_TRIAGEM=0` reduzem a rodada. Apague a pasta temporária e encerre o servidor ao final.

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
