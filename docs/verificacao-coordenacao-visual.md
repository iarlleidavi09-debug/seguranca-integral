# Verificação: visual da coordenação (25/10/2026)

Spec: `docs/superpowers/specs/2026-10-25-coordenacao-visual-design.md`. Plano: `docs/superpowers/plans/2026-10-25-coordenacao-visual.md`.

## Suítes completas

| Verificação | Resultado |
| --- | --- |
| Coordenação, Vitest com `--maxWorkers=1` | 26 arquivos, 317 testes (dois testes das abas dependiam do foco inicial do título sob carga e foram estabilizados) |
| Portal do aluno, Vitest com `--maxWorkers=1` | 28 arquivos, 348 testes (inclui `csp.test.ts`, que pegou um `style=` indevido no mapa durante a série) |
| `npm run build:coord` e `npm run build:aluno` | aprovados, com `tsc` |
| Backend: `test_empacotamento.py` e `test_server.py` | 80 aprovados (o backend não mudou nesta etapa) |

## Chrome real (Playwright, backend real, banco temporário, portas 3100 e 4100), 16 casos de teste

| Medida | Antes | Depois |
| --- | --- | --- |
| Fila em 375 px | 6.910 px | **3.207 px** (128 a 201 px por caso; meta de 2.500 px **não atingida**) |
| Cabeçalho em 375 px | cerca de 240 px | 115 px (meta até 130 px) |
| Barra lateral em 1280x1100 | considerada cortada em 800 px | sticky, 1100 px, metal cobrindo tudo (o corte era artefato de captura de página inteira) |
| Rótulos do eixo dos Relatórios em 768 px | 6,6 px | 14 px (14,3 px em 1280) |
| Compositor fixo em 375 px | não existia | 162 px com 2 linhas, 246 px com 6 |

Verificado e aprovado: clique, seleção de texto e teclado na linha da fila; texto "+N" para leitor de tela; item atual da navegação visível em todas as telas no celular; "Sair" com 44 px; ordem de Tab no desktop (marca, navegação, Sair e Pausar); foco depois de "Ver versões", de enviar mensagem e de excluir (nunca em `body` depois de 150 ms); página do caso (barra de ações, abas com contadores, painel "Por que esta prioridade?" fixo a partir de 1100 px); menu "⋯" por teclado e abrindo para cima perto do compositor; aviso de retorno do aluno em linha própria; mapa vazio com cartão e foco; rótulos do mapa dentro das caixas; Relatórios com lista empilhada e nota de pouco histórico (1 dia sim, 7 dias não); zero erros de console e zero violações de CSP.

## Limitações e decisões

- **Fila em 3.207 px:** com os dados de teste (todos os casos sem responsável e sem primeiro acesso, com 3 a 4 selos cada) a lista ainda é longa. A redução sobre o original é de 54%. Em uso real há menos selos por caso.
- **Ordem de Tab no celular:** a barra mostra o rodapé (Sair e Pausar) antes da navegação, mas no HTML ele vem depois, para preservar o Tab no desktop.
- **Ponto de mensagem nova** na aba Conversa é derivado (o detalhe do caso não traz `mensagens_novas`): pode aparecer em uma visita nova quando a última mensagem é do aluno e já foi lida.
- **"+N" da fila** mostra os motivos escondidos para leitor de tela e `title`, sem alternar por toque.
- Detalhes de baixa gravidade não tratados: selo "mensagens novas" em linha própria no celular, eixo Y e datas anteriores fora de vista no gráfico rolado, selects de 37 px e campos de 39 px no mapa, e o menu "⋯" que cobre parte do compositor quando abre para baixo.
- O Setup em `dist\` precisa ser gerado de novo para levar estas mudanças.
