# Verificação: editar e excluir mensagens da coordenação (22/10/2026)

Spec: `docs/superpowers/specs/2026-10-22-editar-excluir-mensagens-design.md`. Plano: `docs/superpowers/plans/2026-10-22-editar-excluir-mensagens.md`.

## Suítes completas

| Verificação | Resultado |
| --- | --- |
| Backend, `pytest backend/tests` da raiz | 1125 aprovados (a execução inicial teve 1 falha por tempo limite de 15 s num teste da CLI; o limite subiu para 60 s e o arquivo passa) |
| Portal do aluno, Vitest com `--maxWorkers=1` | 28 arquivos, 292 testes |
| Coordenação, Vitest com `--maxWorkers=1` | 22 arquivos, 237 testes (os de `Conversa` e `Caso` foram reexecutados depois do ajuste de foco: 70 aprovados) |
| `npm run build:aluno` e `npm run build:coord` | aprovados, com `tsc` |

## Navegador real (Chrome, backend real, banco temporário, portas 3100 e 4100)

- Aluno cria o caso, a coordenação envia a mensagem, edita e exclui. O aluno vê "(editada)" com o texto novo e "Mensagem apagada" sem texto nem horário; nunca vê o texto antigo.
- Coordenador diferente do autor não recebe Editar nem Excluir; admin recebe. Histórico mostra "Mensagem editada por X" e "Mensagem apagada por X".
- Teclado: Esc cancela a edição e devolve o foco a Editar; Cancelar a exclusão devolve o foco a Excluir.
- Defeito encontrado e corrigido: após excluir, o foco caía em `body`. Corrigido no commit `affcf59` e reconferido em três rodadas.
- Sem rolagem horizontal em 375, 768 e 1280. Os portais não têm tema escuro, então as capturas "escuras" são iguais às claras.
- Pendente de baixa gravidade: depois de salvar uma edição, a marca "editada" surge até cerca de 1,5 s depois do novo texto (aparece quando a conversa recarrega).

## Fora do que foi verificado

- Migração no banco instalado em `C:\ProgramData`: não foi aberto. A migração é aditiva e foi ensaiada em bancos temporários pelos testes.
- O Setup em `dist\` não foi regenerado; a instalação desta mudança exige gerar um novo.
