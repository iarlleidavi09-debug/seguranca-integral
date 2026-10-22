# Verificação das bifurcações por tema — 17/10/2026

Implementação no checkout atual, preservando o mapa escolar e as alterações anteriores. Catálogo: oito grupos, 29 opções, 85 perguntas (65 novas), quatro perguntas comuns e 95.678 bytes. Todas as opções possuem raiz própria e descendente condicionado. Matriz: [bifurcacoes-por-tema.md](bifurcacoes-por-tema.md).

## Comportamento verificado

- Cyberbullying: mensagens, boatos, imagens/montagens, exclusão e ameaças; canal; circulação das imagens exige seleção de imagens e confirmação de publicação.
- Escopo por tema em raízes e descendentes, condições OR/AND, transição de três níveis e remoção das respostas ocultas. Python e TypeScript usam alcance a partir de respostas válidas.
- Conta: circulação só após mensagens/publicações; senha, aviso de acesso e edição de perfil não abrem esse caminho. Pergunta de local/momento da ameaça usa linguagem neutra.
- Definição pública não expõe pesos ou alertas. Definições antigas sem campos novos e snapshots históricos continuam aceitos. Respostas descritivas novas têm peso zero; cyberbullying isolado não gera alerta crítico.
- Rascunho mantém até 400 IDs com o mesmo padrão do backend, incluindo IDs personalizados. Prazo de 24 horas e exclusão de códigos/fotos/conversas preservados.

## Evidências

Arquivos de execução em `.superpowers/sdd/2026-10-17-bifurcacoes/`:

- Backend: **249 testes passaram** (`backend-final.log`): conteúdo, motor, API v3, catálogo da coordenação, triagem, questionário legado e escolar v4.
- Portal do aluno e módulos compartilhados: **277 testes passaram**, incluindo CSP (`frontend-aluno.log`).
- Coordenação: **190 passaram e um falhou** na primeira execução porque o fixture customizado mantinha perguntas com referências a opções removidas. Fixture corrigido para conservar somente perguntas comuns; arquivo completo **20/20 passou** (`coord-fila-green.log`). Os outros 171 testes já haviam passado. Nenhuma asserção de produção foi removida.
- TypeScript e builds aluno/coordenação passaram (`build-aluno.log`, `build-coord.log`). Contraste: **534 medições, zero falhas** (`contraste.log`).
- Chrome real com dados fictícios e servidor temporário em loopback: publicação de imagens abriu circulação; troca para boatos removeu descendentes do rascunho e do multipart; envio v4 retornou 201 com ano/sala e perguntas puladas; viewport de 390px sem overflow e sem erros JavaScript. Script reproduzível: `frontend/verificacao/bifurcacoes.mjs`. Resultados e capturas em `navegador/`.
- Revisão independente: correções de conta/circulação, pergunta de risco e IDs do rascunho confirmadas; nenhum achado pendente.

O instalador não foi regenerado. Uma escola com `questionario_v3.json` personalizado na pasta de dados mantém sua própria definição; o catálogo padrão novo não sobrescreve essa personalização.
