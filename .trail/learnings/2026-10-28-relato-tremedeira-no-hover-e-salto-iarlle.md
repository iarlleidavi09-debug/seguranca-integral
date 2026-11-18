---
title: "Relato: tremedeira no hover e salto ao digitar"
author: Iarlle
date: 2026-10-28
branch: feature/v1
cost: { minutes: 27, tokens: 44580 }
touches:
  - frontend/src/aluno/Pedido.tsx
  - frontend/src/aluno/aluno.css
  - frontend/verificacao/relato-estavel.mjs
---

## Decided
- A tremedeira no relato vinha de transform nos estados hover/active de .aluno-app .botao. Na borda direita, o deslocamento retirava o botão de sob o ponteiro, alternando hover a cada quadro. Cor e sombra mantêm o feedback sem deslocar a área clicável.
- Limpar rascunho permanece renderizado e desabilitado quando vazio: sua aparição condicional deslocava o textarea 68 px na primeira letra e ao apagar.

## Tried and ruled out
- Reproduzido em Chrome real com ponteiro parado a 0,5 px da borda; as posições alternavam 1 px em todos os quadros. Não era perda de foco nem recarregamento do mapa.

## Watch out
- jsdom não detecta os dois problemas geométricos. Executar frontend/verificacao/relato-estavel.mjs com o Vite aberto; usa API simulada e não cria pedidos.
- Testar digitar e apagar, além de Voltar/Continuar nas larguras 375, 768 e 1280. Rodar builds antes da suíte, pois os testes CSP leem os assets gerados.
