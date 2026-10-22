# Verificação de organização do atendimento e expansão da planta

17/10/2026. Execução sobre dados temporários isolados, sem acesso à base operacional.

## Comportamentos verificados

- Responsável ativo, mudança e remoção de atribuição, próxima ação com data e conclusão com histórico.
- Validação de tipos, data inexistente, texto excessivo, ação sem data e data sem ação.
- Revisão obrigatória e conflito 409; rascunho preservado quando a atualização chega antes ou depois da resposta de conflito.
- Conta desativada continua identificada e exige reatribuição em casos abertos.
- Casos não abertos separados de resolvidos; resolvido com nova mensagem aparece na atenção.
- Motivos e contagens respeitam os filtros; mudança do dia em Brasília atualiza a leitura com SSE online.
- Migração parcial e repetida com backup preservado; dados internos não aparecem no acompanhamento do aluno.
- Planta ampliada em dois eixos, bloco em X=1400/Y=1000 salvo e recarregado.
- Navegador Chrome: scroll nos dois eixos em 100%; sem scroll em 50% quando o conteúdo cabe.
- Desktop 1440 × 1050 e celular 390 × 844 sem transbordamento horizontal da página.

## Evidências

- `backend/tests/test_atendimento.py`: testes de persistência, API, migração, privacidade e limite ampliado da planta.
- `frontend/src/coord/Atendimento.test.tsx`, `Fila.test.tsx`, `polling.test.tsx`, `mapa/Mapa.test.tsx`: interação, filtros, conflito e atualização de data.
- `frontend/src/shared/csp.test.ts`: sem estilos inline; dimensão do SVG usa atributo próprio.
- `frontend/verificacao/atendimento.mjs`: fluxo real de navegador; resultado e capturas em `.superpowers/sdd/2026-10-17-atendimento/navegador/`.
- Build da coordenação com TypeScript e Vite concluído.

A regressão inicial de banco/mapa/API executou 383 testes: 381 passaram e dois contratos anteriores precisaram incorporar os campos de atendimento e o limite ampliado. Os dois contratos corrigidos passaram na rodada final de 18 testes, incluindo os novos cenários de proteção e migração. A rodada final da coordenação passou com 199 testes em 17 arquivos. A suíte do aluno teve 276 testes aprovados e apontou o estilo inline do mapa; após substituí-lo por atributo SVG, os 10 testes de CSP passaram. O build final da coordenação e o fluxo completo de navegador passaram depois dessas correções, sem erros de página.

O executável e o instalador em `dist/` não foram regenerados nesta tarefa; as mudanças estão no código e no build web em `backend/app/static/coordenacao`.
