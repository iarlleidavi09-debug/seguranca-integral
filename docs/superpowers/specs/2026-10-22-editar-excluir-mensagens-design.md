# Editar e excluir mensagens da coordenação ao aluno

Data: 22/10/2026. Subprojeto 1 de 3 do pedido de melhorias do MVP (2: portal do estudante; 3: visual da coordenação, cada um com spec própria).

## Objetivo

A coordenação corrige ou retira uma mensagem que enviou ao aluno, sem perder o histórico do caso e sem expor ao aluno o que foi escrito antes.

## Decisões do usuário (22/10/2026)

- Excluir deixa a marca **"Mensagem apagada"** para o aluno e para a equipe. O texto original fica guardado só para a coordenação, em registro de auditoria.
- Só **quem escreveu** a mensagem e o **admin** podem editar ou excluir. Sem limite de tempo.
- Preservar o visual dos dois portais: nenhuma cor, fonte ou token novo; só componentes e layout dentro do que já existe.

## Fora de escopo

Aluno editar ou apagar as próprias mensagens; editar notas internas; limite de tempo; restaurar mensagem apagada; anexos em mensagens.

## Regras

1. Só mensagens com `autor = 'coordenacao'` são alteráveis. Mensagem do aluno nunca.
2. Permissão: `mensagens.usuario_id == usuário logado` ou `papel == 'admin'`. Mensagem antiga com `usuario_id` nulo (anterior à migração de autoria) só o admin altera.
3. Mensagem apagada não pode ser editada (409). Excluir de novo uma já apagada responde 200 sem efeito.
4. Editar com texto igual ao atual responde 200 sem criar versão nem evento.
5. Texto da edição: 1 a 2000 caracteres, igual ao envio.
6. Nenhuma ação muda o `id` da mensagem. Isso mantém `leituras_conversa.ultimo_id` e a contagem de "mensagens novas" corretas.
7. Editar ou excluir não conta como mensagem nova para o aluno nem para a equipe.

## Dados

Migração aditiva, no padrão de `_migrar_respostas` (`ALTER TABLE ... ADD COLUMN` só se faltar):

- `mensagens.editada_em TEXT` e `mensagens.apagada_em TEXT`, ambos nulos por padrão.
- Tabela nova `mensagens_versoes (id, mensagem_id, caso_id, texto, acao, usuario_id, criado_em)`, com `acao` em `('edicao','exclusao')`. A linha guarda o texto **anterior** à ação e quem a executou.
- Ao excluir: copia o texto atual para `mensagens_versoes`, grava `texto = ''` em `mensagens` e preenche `apagada_em`. Assim nenhuma consulta existente (última mensagem da fila, exportação, atendimento, API do aluno) consegue vazar o texto apagado.
- Eventos novos no histórico do caso: `mensagem_editada` e `mensagem_apagada`, com detalhe `mensagem <id>` e nunca o texto. Tudo na mesma transação da alteração, seguido de `publicar(caso_id)`.

Ensaio da migração numa cópia do banco feita na hora, apagada depois. Sem mexer em banco real.

## API

Rotas da coordenação (mesmo guard das demais rotas `/api/casos/...`):

| Rota | Efeito |
| --- | --- |
| `PATCH /api/casos/<caso>/mensagens/<id>` com `{texto}` | Edita. 200 `{ok:true}`; 400 texto inválido; 403 sem permissão; 404 inexistente ou de outro caso; 409 apagada. |
| `DELETE /api/casos/<caso>/mensagens/<id>` | Exclui. 200 `{ok:true}`; 403; 404. |
| `GET /api/casos/<caso>/mensagens/<id>/versoes` | Lista versões anteriores (texto, ação, quem, quando). Só leitura, só coordenação. |

Formato das mensagens:

- **Coordenação** (detalhe do caso): acrescenta `editada_em`, `apagada_em` e `pode_alterar` (calculado no servidor para o usuário logado). Mensagem apagada vem com `texto: ''`.
- **Aluno** (`/api/acompanhar`): acrescenta só `editada: bool` e `apagada: bool`. Nunca vem `editada_em`, versões, nem quem alterou. Apagada vem com `texto: ''`.
- `estado_conversa.ultima_mensagem` e a exportação HTML passam a tratar apagada como "Mensagem apagada" e editada com o texto atual.

## Interface

Reutiliza `Conversa.tsx` (coordenação) e `Acompanhar.tsx` (aluno), com as classes e tokens existentes.

**Coordenação**
- Em cada mensagem com `pode_alterar`: botões secundários **Editar** e **Excluir**, na linha do horário.
- Editar troca o texto por um `textarea` no lugar, com contador de 2000, **Salvar** e **Cancelar**. Foco vai para o campo ao abrir e volta ao botão Editar ao fechar. Esc cancela.
- Excluir abre confirmação **inline**, sem `window.confirm`: "Excluir esta mensagem? O aluno verá 'Mensagem apagada'." com **Excluir** e **Cancelar**.
- Mensagem editada mostra "editada" ao lado do horário e um botão **Ver versões** (abre a lista anterior). Apagada mostra "Mensagem apagada" em estilo discreto e **Ver texto original** (só para quem pode ver versões, ou seja, a coordenação).
- Erros (403, 409, rede) aparecem junto da mensagem, em `role="alert"`, e o texto digitado nunca se perde.
- `descricaoEvento` ganha os dois tipos novos: "Mensagem editada por X", "Mensagem apagada por X".

**Aluno**
- Editada: rótulo "(editada)" ao lado do horário. Apagada: "Mensagem apagada" no lugar do texto, estilo discreto, sem horário de apagamento.
- `role="log"` e `aria-live` continuam; a atualização chega pelo tempo real que já existe.

## Testes

- Backend (TDD): permissões (autor, outro coordenador, admin, mensagem sem `usuario_id`), mensagem do aluno recusada, apagada não editável, idempotência, edição igual, limites de texto, caso trocado na URL, versões gravadas, eventos sem texto, aluno nunca recebe `editada_em`, versões nem texto apagado, `ultimo_id`/contagem inalterados, exportação e `ultima_mensagem` sem vazamento, migração de banco antigo numa cópia.
- Front: `Conversa` (editar, cancelar, excluir com confirmação, foco, erro preservando o texto), `Caso` (integração com API), `Acompanhar` (rótulos "(editada)" e "Mensagem apagada", sem texto antigo), `rotulos`.
- Suíte completa de backend e front, `tsc` e os dois builds uma vez no fechamento.
- Navegador real (Chrome) nos dois portais em 375, 768 e 1280, temas claro e escuro, com backend real em banco temporário.

## Execução e riscos

- O checkout tem ~61 arquivos modificados e dezenas novos, não commitados, do Codex. Esta mudança toca arquivos que eles também tocam (`casos.py`, `db.py`, `routes_coord.py`, `Conversa.tsx`, `Caso.tsx`, `Acompanhar.tsx`, `api.ts`, `rotulos.tsx`). **Recomendação:** antes de implementar, validar o trabalho do Codex (suítes completas) e commitá-lo em partes, para o diff desta tarefa ficar isolado. Só commito se o usuário pedir.
- A suíte de backend completa mostrou 7 falhas em execução parcial (`FFFFFFF`); identificar e resolver (ou registrar como pré-existentes) antes de começar.
- Risco de vazar texto apagado por consulta que eu não vi: mitigado por apagar `texto` da tabela principal e por teste que varre todas as saídas.
- Custo se a regra de permissão estiver errada: um coordenador alterar mensagem alheia. Mitigado por `pode_alterar` vir do servidor e por teste de cada papel.
