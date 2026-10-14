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

O rascunho guarda apenas os campos textuais e escolhas em `si-aluno-rascunho-v1`. Não guarda código, imagens ou conversa. É apagado após o envio. Anexos permanecem em memória durante uma tentativa com falha e precisam ser adicionados novamente se a tela for fechada. Toda operação de localStorage trata indisponibilidade.

## Verificação em navegador

```powershell
npm run build:aluno
npm run test:navegador
```

Requer Chrome instalado. O script serve o build com a CSP do brief e **API simulada**. Verifica o percurso em 375, 768 e 1280 px, claro e escuro, e grava 42 capturas em `verificacao/capturas/` e resultados em `verificacao/resultado.json`. Esses artefatos são locais e não entram no commit. Não substitui a integração com Flask e banco real.

## Portal da coordenação

```powershell
npm run build:coord
npm run dev:coord
```

O build gera `../backend/app/static/coordenacao/index.html`. `npm test` roda as suítes dos dois portais, sem navegador. A verificação em Chrome real da coordenação é `verificacao/coordenacao.mjs` (precisa de `SI_COORD_URL` e `SI_COORD_SENHA`).

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
