# Simplificação da coordenação

**Objetivo:** diminuir controles visíveis simultaneamente com grupos recolhíveis acessíveis.

**Spec:** `docs/superpowers/specs/2026-11-16-coordenacao-acoes-recolhidas.md`.

**Arquitetura:** manter componentes e APIs, usando details/summary para conteúdo secundário sem desmontar o estado. Identidade e estilos comuns permanecem em identidade.css.

## Escopos independentes

- [x] Navegação: `Navegacao.tsx`, seus testes, testes de App e AppMapa afetados. Três destinos principais e dois grupos; preservar indicação de pendências e seleção.
- [x] Fila e caso: `Fila.tsx`, `Caso.tsx`, componentes de ações associados e testes afetados; agrupar alternativas, mantendo tarefas primárias acessíveis.
- [x] Mapa e relatórios: `mapa/Mapa.tsx`, `Relatorios.tsx`, testes correspondentes; recolher ferramentas e exportação, trocar modos de gráfico por seletor.
- [x] Integração: estilos comuns em `identidade.css`, revisão, suíte da coordenação, build e navegador nos dois temas e três larguras.

Resultado e evidências: `docs/verificacao-coordenacao-acoes-recolhidas-2026-11-16.md`.

Não fazer commit, push, deploy, apagar dados nem alterar o aluno. Preservar os diffs preexistentes. Em testes usar pool threads com um worker e sem isolamento para evitar os timeouts de processos observados nesta máquina; não alterar a configuração do projeto.
