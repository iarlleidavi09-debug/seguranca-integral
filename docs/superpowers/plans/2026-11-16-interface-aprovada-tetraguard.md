# Integração visual do TETRAGUARD

> Execução: tarefas independentes por portal com revisão integrada e validação no navegador.

**Objetivo:** integrar a interface aprovada ao código principal desta pasta.

**Arquitetura:** manter React, APIs e estado existentes. Redefinir identidade visual por portal e ajustar a composição de início/visão geral sem substituir recursos reais por simulações.

**Stack:** React, TypeScript, CSS, Vite, Vitest e playwright-cli.

**Especificação:** `docs/superpowers/specs/2026-11-16-interface-aprovada-tetraguard.md`.

## Restrições

- Trabalhar nesta pasta conforme confirmação do usuário; preservar todos os diffs anteriores e não criar commits ou publicar durante a integração.
- Portal do aluno sempre neobrutalista; coordenação sóbria, com conteúdo espaçado em 16 px em todas as telas.
- Preservar fluxos, controles, contratos, dados, códigos, filtros, relatórios e permissões.
- Não adicionar casos/planta da prévia, serviços externos nem dependências desnecessárias.
- Usar fontes já empacotadas; nenhuma dependência externa de fontes em tempo de execução.
- Temas claro e escuro e larguras 375/768/1280 obrigatórios.

## Pontos de revisão

- Mudanças visuais não podem eliminar anexos, rascunhos, recibos ou percursos opcionais.
- Estilos de um portal não podem afetar o outro.
- Contraste no destaque verde permanece legível no tema escuro.
- Estados de conexão, erro e vazio devem continuar visíveis e coerentes.
- Contadores e tarefas vêm das APIs reais; funções da prévia que não existem no backend não são inventadas nesta integração visual.

## Tarefa 1: Portal do aluno

Arquivos: `frontend/src/aluno/Inicio.tsx`, `frontend/src/aluno/aluno.css`, componentes do mesmo diretório apenas quando necessários. Importação local em `main.tsx` se a organização dos estilos justificar.

- [x] Conferir componentes e alterações existentes antes de editar.
- [x] Aplicar paleta clara quente/verde vivo, bordas retas, sombras sólidas, tipografia forte e equivalentes escuros.
- [x] Aproximar o início da composição aprovada, preservando entradas, acompanhamento por código, acessos locais e texto factual.
- [x] Verificar os testes existentes do portal; adicionar teste somente se surgir comportamento novo.
- [x] Entregar lista de arquivos e verificação realizada.

## Tarefa 2: Coordenação

Arquivos: `frontend/src/coord/main.tsx`, folha de estilo específica, `App.tsx`, `Geral.tsx` e testes afetados, quando necessários.

- [x] Conferir componentes e alterações existentes antes de editar.
- [x] Trocar a camada visual Fluent por uma identidade consistente verde/neutra, mantendo o CSS estrutural necessário.
- [x] Definir o espaçamento do painel em 16 px para todas as telas e larguras.
- [x] Reorganizar visão geral em prioridades, pedidos e próximos passos usando dados reais.
- [x] Preservar telas e funções de casos, mapa, relatórios, pós-resolução e administração.
- [x] Testar primeiro novos comportamentos de navegação se introduzidos; manter a suíte existente.
- [x] Entregar lista de arquivos e verificação realizada.

## Tarefa 3: Integração e entrega

- [x] Rever diffs apenas dos arquivos tocados e resolver regressões.
- [x] Executar testes dos dois portais, TypeScript, builds de produção e verificação de contraste relevante.
- [x] Verificar interfaces locais com API de teste em 375, 768 e 1280, em claro e escuro.
- [x] Registrar resultados em documento de verificação e atualizar o contexto de design sem apagar decisões históricas.
- [x] Informar alterações feitas no código e separar isso de eventual publicação, que não foi solicitada.
