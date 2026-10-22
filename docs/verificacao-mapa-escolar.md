# Mapa escolar: implementação e verificação

Data: 17/10/2026. Escopo: mapa da coordenação, turma obrigatória de quem relata, autoria interna na finalização e complemento de alas em L.

## Comportamento implementado

- Planta inicialmente vazia, com desenho, criação por formulário, nome, posição, tamanho, desfazer, cancelamento e salvamento versionado.
- Retângulos e alas em L, rotação de 0/90/180/270 graus e braços ajustáveis de 15% a 85% das dimensões.
- Hierarquia navegável por ala/andar/sala, busca, zoom e totais por descendentes. Distribuições por ano/turma e filtros de período/base.
- Rascunho da planta preservado entre abas da coordenação e descartado ao sair da sessão. Conflito de revisão preserva o desenho.
- Ano e sala do relator obrigatórios no novo envio v4, inclusive sem nome; local desconhecido e catálogo indisponível não impedem ajuda. Revisão alerta que turma e conteúdo podem permitir reconhecimento.
- Finalização com até dez autores identificados, nome/ano/sala obrigatórios e foto opcional, ou autoria não identificada com justificativa interna.
- Fotos e dados dos autores são exclusivos da coordenação; agregado e acompanhamento do aluno não recebem essas identidades.
- Migração aditiva, backups antes das alterações, preservação de contratos anteriores e códigos existentes. Casos antigos não recebem turmas inferidas.

## Evidências registradas

Frontend completo: 257 testes do aluno/shared e 191 da coordenação passaram. TypeScript e builds dos dois portais executados; o build final da coordenação no diretório de produção inclui suporte ao L. Contraste: 534 medições, zero falhas.

Chrome real com banco fictício e dois portais em loopback: criar ala em L por mouse, ajustar nome, sair para Casos e voltar sem perder desenho, criar andar e sala, salvar/reabrir/buscar, enviar relato sem nome com turma/local e finalizar com autor/foto. A rota da foto respondeu somente com sessão; o acompanhamento não retornou identidade do autor. Agregado por autores refletiu a turma apurada. Desktop claro/escuro e celular de 390 px sem overflow geral ou erro de JavaScript.

Revisão independente identificou perda de rascunho na navegação interna; corrigida e confirmada em revisão e testes. O ensaio de navegador identificou bloqueio HTML de valores fracionários nos campos numéricos; geometria normalizada e cenário repetido com sucesso. O recorte vazio do L não recebe clique: o teste usa o próprio contorno ou a lista acessível para selecionar.

Os logs, capturas e resultados detalhados estão em `.superpowers/sdd/2026-10-17-mapa-escolar/`. O roteiro reproduzível é `frontend/verificacao/mapa-escolar.mjs`, usando duas origens locais e um banco novo reservado ao teste.

## Backend

A execução completa sobre a base inicial da implementação terminou com **959 testes passando e três falhas em expectativas antigas de campos**: allowlist do detalhe, formato da resolução legada e colunas da tabela de resoluções. Essas expectativas foram ampliadas exatamente com os campos aprovados, mantendo a allowlist de privacidade e os valores vazios de autoria para resoluções antigas.

Depois das correções e dos complementos L, backup específico da geometria, snapshot do caminho do ambiente e transação na limpeza de simulações, o **dirigido final passou com 55 testes, saída 0, em 103,30 segundos**. Inclui as três expectativas corrigidas, migração, backup, idempotência, fotos privadas/rollback e exclusão concorrente. Não se afirma uma segunda execução integral: o registro distingue a execução de base das regressões finais dos arquivos afetados.

Logs: `backend-full.log`, `backend-targeted.log`, `frontend-aluno-final.log`, `frontend-coord-final.log`, `build-aluno.log`, `build-coord-producao.log`, `contraste-final.log` e `navegador-l-final.log` no diretório de evidências. Os vinte diretórios temporários criados pelos testes foram arquivados sob `test-data/early-runs`, fora dos arquivos distribuíveis.

## Limites

Os ensaios usam dados fictícios e loopback. Não foi feita instalação na escola nem teste a partir de outro aparelho da LAN. O instalador anterior não representa automaticamente este código: é necessário gerar novo pacote pelo processo documentado antes da distribuição.
