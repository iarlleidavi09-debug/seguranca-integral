# Coordenação: ações recolhidas

Implementação na base principal em 16/11/2026. Não publicada na hospedagem.

## Resultado

- Navegação com três destinos visíveis: Visão geral, Meu atendimento e Casos. Organização e Ferramentas abrem as demais áreas, preservando permissões, seleção e pendências.
- Organizar fila reúne visualizações, filtros e favoritos. Busca e conversa continuam acessíveis.
- Gerenciar caso reúne ações administrativas, reavaliação e resolução. Fechar o grupo preserva rascunhos; uma resolução em edição mantém o grupo aberto.
- Mapa recolhe zoom, busca com seus resultados e alterações avançadas de tamanho. Salvar e cancelar permanecem visíveis durante a edição.
- Relatórios usam um seletor de visualização e um grupo para exportação CSV/PDF.
- Controles nativos details/summary, foco visível, temas claro/escuro e espaçamento interno de 16 px. Portal do aluno e APIs não alterados nesta tarefa.

## Validação

| Verificação | Resultado |
| --- | --- |
| Suíte completa da coordenação | 32 arquivos, 365 testes aprovados |
| TypeScript e build de produção da coordenação | Saída 0 |
| Contraste | 416 verificações, zero falhas |
| Navegador real com playwright-cli | 30 verificações de layout; 375, 768 e 1280 px, nos temas claro e escuro |
| Teclado e estado | Abrir/fechar navegação com Enter; filtros, rascunho de reavaliação, modo de gráfico, busca e zoom preservados |
| Proteção da resolução | Grupo de gestão permanece aberto enquanto a resolução está em edição |
| Console e largura | Zero erros de página; sem transbordamento horizontal nas telas verificadas |

Comandos executados a partir de `frontend/`: `node node_modules/vitest/vitest.mjs run --config vite.coord.config.ts --pool=threads --maxWorkers=1 --no-isolate`, build da coordenação e `node verificacao/contraste.mjs`. O pool de um worker evita os timeouts de processos observados nesta máquina sem alterar a configuração do projeto.

O roteiro de navegador percorreu Visão geral, Casos, conversa de um caso, Relatórios e Mapa na aplicação compilada, servida pelas fábricas Flask reais. Usou banco temporário com dados fictícios e sessão de demonstração, sem credenciais ou dados de produção. URL local: `http://127.0.0.1:5291/`.

Evidências locais temporárias em `tmp/interface-aprovada/`: `colapsar-suite.log`, `colapsar-build.log`, `colapsar-browser.json`, roteiro `browser-colapsados.js` e capturas `coord-simples-{light,dark}-{375,768,1280}.png`. Capturas de casos em 375 e 1280 px também foram geradas. Inspeção visual final feita no desktop claro e celular escuro.

Na revisão, os resultados da busca do mapa foram movidos para dentro do mesmo grupo do campo. O teste de regressão reproduziu o problema antes da correção e passou na suíte final. Em jsdom, controles de details fechados podem aparecer em queryByRole; os testes verificam visibilidade e estado open, preservando os elementos montados e seus rascunhos.
