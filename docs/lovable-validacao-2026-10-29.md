# Validação da demonstração Lovable em 29/10/2026

Projeto remoto: https://lovable.dev/projects/daa1c13e-bb1d-40e8-9068-dafaa5bf1098

Prévia: https://id-preview--daa1c13e-bb1d-40e8-9068-dafaa5bf1098.lovable.app

Commit da rodada: `38a3a16edf29dc620675f4a73dfaf13ff8f0b758`. Dados exclusivamente fictícios; nenhum envio a escola real. Testes na webview do aplicativo, pela interface.

## Percurso principal testado por cliques

- Seleção de mensagens ofensivas; frequência abriu desdobramento de duração. Selecionar imagem abriu a pergunta de compartilhamento; trocar para mensagens removeu a resposta de imagem da revisão.
- Avançar sem ano/sala apresentou erro. Foi possível enviar sem nome, com ano/sala fictícios.
- Pedido gerou `SI-Q34E-7Y38`; código sem hífens, em minúsculas e com espaços também abriu o caso. O endereço do acompanhamento não incluiu o código.
- Mensagem do estudante apareceu na coordenação; resposta da equipe apareceu no acompanhamento do estudante.
- Nota interna `INTERNO-QA-2910` e registro `RESERVADO-QA-2910` não apareceram no DOM da tela do estudante.
- Resolução exibiu somente o resumo público ao estudante. Reabertura removeu o estado resolvido e devolveu o campo de mensagem.
- Nova resolução no código atualizado exigiu justificativa interna para autoria não identificada e colocou o caso em Pós-resolução.
- Acolhimento foi criado somente com a primeira mensagem, sem nome, ano ou sala. Código fictício gerado: `SI-CDYJ-KR5Z`.

## Outras verificações por interface

- Busca pelo código retornou o caso; código inexistente retornou estado vazio. Limpar e filtro de acolhimento funcionaram.
- Responsável foi alterado para Equipe demonstrativa.
- Mapa: seleção de Pátio mostrou os casos associados, incluindo o criado no teste. Troca de andar mostrou os outros ambientes. Foi criada uma ala em L, renomeada e reposicionada por campos numéricos; exclusão da própria ala de teste exigiu confirmação. Os seis ambientes iniciais foram preservados.
- Relatórios: filtro de turma 8º ano B retornou dois casos e atualizou contagens. CSV foi efetivamente baixado; leitura do arquivo confirmou BOM UTF-8, cabeçalho e duas linhas de dados, incluindo o caso de teste.
- ROE: o botão abriu confirmação de relatório fictício com dados internos. O TXT foi efetivamente baixado, com cabeçalho de relatório de apoio e aviso de que não é documento oficial nem envio ao ROE.
- Reavaliar prioridade pediu justificativa e confirmação humana; após confirmar, a prioridade mudou para Alta.
- Ensaio abriu com links para apresentação, pedido, acompanhamento e caso da coordenação. Reinício global não foi executado pelo Codex nesta rodada para preservar os dados da sessão.

## Responsividade observada

Sem transbordamento horizontal em 375, 768 e 1280 pixels nas telas Fila, Mapa, Relatórios e Meu atendimento. Conversa também sem transbordamento em 375 pixels, porém o rótulo Em acompanhamento nas etapas precisa de ajuste de quebra dentro da célula. Não equivale a auditoria completa de acessibilidade.

## Evidência visual

Captura do mapa: `../output/lovable-mapa-validado-2026-10-29.jpg`.

## Validação informada pelo Lovable

O agente remoto executou `bunx vitest run src/lib/rules.test.ts src/lib/staff-tools.test.ts src/test/app-routing.test.tsx` e informou 19 testes aprovados. Também iniciou um roteiro Playwright próprio, mas declarou sua validação por cliques incompleta. Os testes por interface descritos acima foram realizados separadamente pelo Codex.

Não há evidência de `bun run build` concluído. Não houve publicação.

## Pendências bloqueadas por créditos

Anexos de imagens; rascunho com expiração de 24h; relato com contador e limite de 4000; revisão por seção; trava de envio; orientação de segurança atual; ajuste das etapas no celular; build de produção e auditoria completa de foco, teclado e contraste. A tentativa de continuar essa etapa foi recusada pelo Lovable por saldo insuficiente.
