# Portal do aluno

React, Vite e TypeScript. API em mesma origem, com código de acompanhamento somente no corpo de requisições POST. Sem roteador ou código de caso em URLs.

```powershell
cd frontend
npm install
npm test
npm run build:aluno
```

O build gera `../backend/app/static/aluno/index.html` e `assets/`. Sirva essa pasta na raiz da origem do portal, como faz a rota SPA do backend. O desenvolvimento com `npm run dev` encaminha `/api` para `127.0.0.1:3000`.

O tema segue `docs/design/tokens.md` e `prefers-color-scheme`. A fonte é empacotada por `@fontsource/atkinson-hyperlegible`, conforme o brief específico desta tarefa. O pacote tem pesos 400 e 700; a interface usa esses dois pesos. Não depende de Google Fonts, CDN, estilos inline ou scripts inline.

O rascunho guarda apenas os campos textuais e escolhas em `si-aluno-rascunho-v1`. Não guarda código, imagens ou conversa. É apagado após o envio. Anexos permanecem em memória durante uma tentativa com falha e precisam ser adicionados novamente se a tela for fechada. Toda operação de localStorage trata indisponibilidade.

## Verificação em navegador

```powershell
npm run build:aluno
npm run test:navegador
```

Requer Chrome instalado. O script serve o build com a CSP do brief e **API simulada**. Verifica o percurso em 375, 768 e 1280 px, claro e escuro, e grava 42 capturas em `verificacao/capturas/` e resultados em `verificacao/resultado.json`. Esses artefatos são locais e não entram no commit. Não substitui a integração com Flask e banco real.
