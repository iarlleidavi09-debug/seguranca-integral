# Refinamento da interface de coordenação

Data: 03/11/2026.
Projeto Lovable: daa1c13e-bb1d-40e8-9068-dafaa5bf1098.
Alvo inicial: /coordenacao.
Estado: proposta preparada; alterações visuais ainda não aplicadas no Lovable por falta de créditos.

## Base da proposta

Leitura da implementação atual de `src/routes/coordenacao.tsx` e `src/routes/coordenacao.index.tsx`. Esta proposta não representa uma inspeção visual atual da página em execução nem uma auditoria completa de acessibilidade.

Preservar a identidade existente da coordenação: fundo cinza claro, superfícies brancas, azul #0f6cbd, tipografia Segoe UI e cantos discretos. Preservar a identidade própria da área do aluno. Manter rotas, funcionalidades, dados fictícios e armazenamento local existentes.

## Mudanças prioritárias

### 1. Hierarquia da visão geral

- Usar um cabeçalho com título e data claramente separados e uma ação principal “Ver todos os casos”.
- Manter os quatro indicadores de estado como um resumo compacto, com números alinhados e rótulos legíveis.
- Dar maior destaque à lista “Precisam de atenção”, com seu total visível e uma explicação curta do critério real já usado pelo sistema.
- Ordenar os casos pelo critério de prioridade existente. Não criar pontuação, prazo ou indicador sem respaldo nos dados.
- Quando não houver pendências, mostrar um estado vazio breve com acesso à fila completa.

### 2. Leitura dos casos

- No desktop, alinhar assunto, prioridade, situação e data em colunas consistentes, evitando as quebras imprevisíveis do flex atual.
- Dar maior peso ao assunto; usar data como informação secundária.
- Representar prioridade e situação com texto e cor, sem depender apenas da cor.
- Manter o indicador de mensagem não lida junto ao caso correspondente.
- Exibir responsável e próxima ação somente se os dados existentes os disponibilizarem; não inventar conteúdo para preencher o painel.
- No celular, converter cada linha em um bloco vertical com assunto primeiro e metadados abaixo.

### 3. Menu lateral consistente

- Usar um único componente de navegação para todos os itens, com a mesma altura, espaçamento, alinhamento de ícone e estado ativo.
- Manter ícones com tamanho consistente e rótulos sempre visíveis no desktop.
- Diferenciar a página atual com fundo azul claro, texto e indicação acessível de página atual.
- Separar visualmente atendimento, acompanhamento e ferramentas, sem alterar os nomes das rotas.
- No celular, usar navegação compacta acessível, sem comprimir os sete itens em várias linhas de botões.

### 4. Ritmo e acabamento

- Aplicar uma escala consistente de espaçamento baseada em 4/8 px, com maior separação entre seções do que entre elementos relacionados.
- Usar títulos, rótulos e textos auxiliares com hierarquia tipográfica estável.
- Reservar o azul mais forte para ações e seleção. Evitar sombras e cartões adicionais sem função.
- Tornar estados de foco, hover, carregamento, erro e vazio coerentes entre componentes.

## Ordem de execução

1. Aplicar a correção funcional pendente em `output/lovable-correcoes-2026-11-03/reiniciar-envio.patch` e verificar a reinicialização da demonstração após um envio.
2. Refinar o layout compartilhado da coordenação e a visão geral.
3. Verificar desktop e celular; corrigir os problemas encontrados em um lote.
4. Só depois estender o mesmo padrão à fila, detalhe do caso e mapa.

## Critérios para considerar aplicado

- Em 375 px de largura não há rolagem horizontal nem sobreposição dos controles.
- Em desktop, os metadados dos casos ficam alinhados e a lista de atenção tem hierarquia clara.
- Todos os itens do menu usam a mesma estrutura visual e indicam a página atual.
- Navegação por teclado, foco visível, contraste e alvos de toque são verificados na versão executada.
- Abrir um caso, navegar entre telas e reiniciar a demonstração continuam funcionando.
- Executar verificação de tipos, testes relevantes existentes e build; registrar o resultado real.
- Não publicar em produção nem adicionar backend, autenticação ou métricas nesta rodada.
