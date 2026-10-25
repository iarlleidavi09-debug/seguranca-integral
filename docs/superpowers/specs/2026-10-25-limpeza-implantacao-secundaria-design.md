# Limpeza da implantação secundária

Data: 25/10/2026.

## Objetivo

Em uma instalação marcada como **secundária** (teste, treinamento ou demonstração), o primeiro admin remove todos os dados de uso (casos, conversas, anexos e cópias de segurança) com um botão, preservando apenas os usuários e o mapa da escola, para recomeçar do zero sem reinstalar.

## Decisões do usuário (25/10/2026)

- Só **sobram usuários e mapa**. Todo o resto é apagado.
- O botão aparece **somente** se a instalação estiver marcada como secundária. Em implantação normal ele não existe.
- Quem pode usar: **o primeiro admin**.
- As **cópias de segurança são apagadas por padrão** (opção marcada), com possibilidade de desmarcar.

## Fora de escopo

Instalação ou Setup com opção gráfica de marcar o modo secundário (nesta etapa o modo se liga editando o `config.json`; o instalador pode oferecer isso depois); apagar usuários, mapa, `config.json` ou chaves; limpeza parcial (só um período ou só um tipo de dado); agendamento; restauração depois da limpeza; limpar os acessos salvos no navegador dos alunos (ficam sem efeito, pois os códigos deixam de existir).

## Modo secundário

- `config.json` aceita `"implantacao_secundaria": true`. `Config` ganha o campo `implantacao_secundaria: bool = False`. O valor precisa ser exatamente booleano (qualquer outro tipo é erro de configuração, mesma regra de `_porta`: `type(valor) is bool`, mensagem `config.json: implantacao_secundaria precisa ser true ou false`, saída 4).
- Sem a chave ou com `false`, a funcionalidade não existe: as duas rotas novas respondem **404** (o mesmo corpo de "não encontrado" das demais) e a tela não mostra nada.
- A chave é lida na partida do servidor; trocar o valor exige reiniciar o serviço (documentar em `docs/operacao-lan.md` e nos `LEIA-ME`).

## Primeiro admin

É o usuário com `papel = 'admin'` de **menor `id`** (o criado no primeiro acesso). Se essa conta estiver desativada, ninguém pode limpar (sem exceções automáticas). Outro admin ou um coordenador recebe **403** nas duas rotas.

## API (porta da coordenação)

As duas rotas entram em `SO_ADMIN` e a rota verifica, além do papel, que o usuário logado é o primeiro admin. Seguem a guarda de escrita existente (JSON obrigatório, 415 sem `Content-Type: application/json`) e exigem sessão válida (401).

| Rota | Efeito |
| --- | --- |
| `GET /api/implantacao` | 404 se não for secundária; 403 se não for o primeiro admin; senão 200 `{"secundaria": true, "resumo": {"casos": n, "mensagens": n, "anexos": n, "arquivos": n, "backups": n}, "ultima_limpeza": {"em": "...", "por": "nome", "casos": n} \| null}`. `backups` conta as subpastas de cópia e os arquivos `seguranca.db.pre-*.bak` ao lado do banco (cópias completas do banco, com texto de casos). |
| `POST /api/implantacao/limpar` com `{"senha": "...", "confirmacao": "APAGAR TUDO", "apagar_backups": true}` | Valida na ordem: flag (404), primeiro admin (403), `confirmacao` exatamente igual a `APAGAR TUDO` (400 `{"erro": "confirmacao invalida"}`), `apagar_backups` booleano (400), senha (403 `{"erro": "senha incorreta"}`; usa `auth.autenticar` com o nome do próprio usuário, então as falhas entram no mesmo contador de tentativas e bloqueio do login, e o bloqueio responde 403 também, sem revelar a diferença). Em seguida apaga e responde 200 `{"ok": true, "removidos": {"casos": n, "mensagens": n, "anexos": n, "arquivos": n, "backups": n}}`. |

`apagar_backups` ausente vale `true` (padrão). O corpo inválido nunca apaga nada.

## O que é apagado e o que fica

**Apaga (uma transação `BEGIN IMMEDIATE`):** `DELETE FROM casos`, com as tabelas filhas saindo por `ON DELETE CASCADE` (`anexos`, `mensagens`, `mensagens_versoes`, `notas_internas`, `leituras_conversa`, `eventos`, `resolucoes`, `autores_resolucao`, `situacoes_aluno`, `revisoes_recorrencia`, `envios`); depois `DELETE FROM sqlite_sequence WHERE name IN (...)` das tabelas acima, para os números recomeçarem do 1. Antes de apagar, a rota lê os nomes de todos os arquivos de `anexos.nome_interno` e `autores_resolucao.foto_nome`.

**Depois do commit (nunca antes):** remove os arquivos do disco em `uploads/` (os nomes lidos acima e, por segurança, qualquer outro arquivo restante da pasta; a pasta em si é mantida); se `apagar_backups`, remove as subpastas de `backups/` e os arquivos `seguranca.db.pre-*.bak` ao lado do banco (cópias completas do banco, com texto de casos, criadas pelas migrações; glob estrito, nunca `seguranca.db`, `-wal`, `-shm`, `config.json` nem chaves); executa `PRAGMA wal_checkpoint(TRUNCATE)` e `VACUUM`, para o SQLite não manter o conteúdo apagado em páginas livres.

**Preserva:** `usuarios` (contas, senhas e papéis), `ambientes` e `mapa_estado` (o mapa da escola), `config.json`, `secret.key`, `sessao.key`, `risk_terms.json`, `questionario*.json`, `limpezas_implantacao`, o esquema do banco. O admin que limpou continua logado.

**Falha no meio:** se a transação do banco falhar, nada é apagado do disco e a rota responde 500 sem alterar nada. Se a remoção de um arquivo falhar depois do commit, o erro é registrado no log (sem nomes de casos) e a resposta traz `{"ok": true, "avisos": ["n arquivos não puderam ser removidos"]}`; a base já está limpa.

## Registro da limpeza

Tabela nova `limpezas_implantacao (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL, casos INTEGER NOT NULL, mensagens INTEGER NOT NULL, anexos INTEGER NOT NULL, backups INTEGER NOT NULL)`, criada por migração aditiva idempotente (padrão `_migrar_*` de `db.py`), preservada pela própria limpeza. Cada limpeza insere uma linha na mesma transação. `GET /api/implantacao` devolve a última. Nenhum texto de caso é gravado.

Depois da limpeza o servidor chama `publicar(None)` para que as telas abertas se atualizem (um caso aberto passará a responder "não encontrado") e registra uma linha de log sem dados pessoais (`limpeza da implantacao: usuario <id>, casos <n>`).

## Interface

- Local: tela **Usuários**, cartão **Implantação secundária** no fim da página, só quando `GET /api/implantacao` responde 200 (a tela ignora 404 e 403 em silêncio). Usa as classes e tokens de `coord.css` e `fluent.css`; sem cor, fonte ou variável nova (o tom de perigo já existe: `--perigo-base` e `--perigo-suave`).
- Conteúdo do cartão: título "Implantação secundária: apagar todos os dados"; texto curto "Apaga casos, conversas, anexos e, se marcado, as cópias de segurança. Mantém usuários e o mapa. Não há como desfazer."; contagem atual ("12 casos, 48 mensagens, 5 anexos, 3 cópias de segurança"); "Última limpeza: em DD/MM/AAAA HH:MM por Nome (N casos)" quando houver; botão **Apagar todos os dados…**.
- Ao clicar, abre um painel de confirmação no lugar (sem `window.confirm`): campo **Senha** (`type="password"`, `autocomplete="current-password"`), campo **Digite APAGAR TUDO para confirmar**, caixa **Apagar também as cópias de segurança** (marcada), botão **Apagar tudo** (estilo de perigo, desabilitado até a frase estar exata e a senha preenchida) e **Cancelar**. O foco vai para o campo de senha ao abrir e volta ao botão de abertura ao fechar; Esc cancela; durante a chamada os botões ficam desabilitados e o painel mostra "Apagando…" (`role="status"`).
- Erros em `role="alert"` com o texto de `mensagemErroCoord` ou "A senha está incorreta." (403) e "Confirme digitando exatamente APAGAR TUDO." (400); a senha nunca é mantida depois de uma falha de rede ou de um sucesso.
- Sucesso: mensagem "Dados apagados: N casos, N mensagens, N anexos, N cópias de segurança." (`role="status"`), as contagens do cartão zeram, o rascunho local da coordenação é limpo (`limparRascunhosAtendimento()`) e o resumo da navegação é atualizado.
- Texto novo sem travessões longos, em português do Brasil.

## Arquivos

Backend: `config.py` (campo e validação), `db.py` (migração de `limpezas_implantacao`), novo módulo `implantacao.py` (contagem e limpeza, sem Flask: `resumo(conn, config) -> dict` e `limpar(conn, config, usuario_id, apagar_backups) -> dict`), `routes_coord.py` (duas rotas e `SO_ADMIN`), `auth.py` só se faltar um auxiliar para o primeiro admin (`primeiro_admin_id(conn) -> int | None`). Front: `frontend/src/shared/api.ts` (tipos e chamadas `obterImplantacao` e `limparImplantacao`), novo `frontend/src/coord/LimparImplantacao.tsx`, `Usuarios.tsx` (renderiza o cartão), `coord.css` (só classes novas compostas com tokens existentes). Docs: `docs/operacao-lan.md`, `installer/LEIA-ME*.txt` (como ligar o modo e o que a limpeza faz), guia da coordenação em `docs/`, nota do dia no Vault.

## Testes

Backend (TDD, bancos e pastas temporários dos fixtures; nunca o banco real):
- `config`: aceita `true` e `false`, rejeita `"true"`, `1`, `null`; padrão `False`.
- Flag desligada: `GET` e `POST` dão 404 mesmo para o primeiro admin; sem sessão 401; sem JSON 415.
- Flag ligada: coordenador comum 403; segundo admin 403; primeiro admin 200.
- `POST`: frase errada 400 (nada apagado); `apagar_backups` não booleano 400; senha errada 403 e `tentativas` do usuário incrementa; bloqueio por tentativas bloqueia a limpeza também; senha certa apaga.
- Sucesso: tabelas filhas vazias; `usuarios`, `ambientes` e `mapa_estado` iguais; `config.json`, `secret.key`, `sessao.key` e `risk_terms.json` presentes; novos casos recomeçam do id 1; os arquivos de `uploads/` somem (anexos e fotos); com `apagar_backups: true` as subpastas de `backups/` e os `seguranca.db.pre-*.bak` somem, com `false` ficam; o login do admin e o de outro usuário continuam funcionando.
- Privacidade física: um texto único gravado em um caso (relato e mensagem) não aparece nos bytes de `seguranca.db`, nem de `-wal`, depois da limpeza (prova do `VACUUM` e do checkpoint).
- Atomicidade: se a transação do banco falhar (simulada), nenhum arquivo do disco é removido; falha ao remover um arquivo gera `avisos` e não desfaz a limpeza; segunda chamada seguida (nada a apagar) responde 200 com zeros.
- `GET`: contagens corretas, `ultima_limpeza` nula antes e preenchida depois; migração em banco antigo sem a tabela.
- `publicar` é chamado uma vez.

Front: cartão ausente em 404 e 403; presente com contagens; botão "Apagar tudo" só habilita com a frase exata e senha; foco, Esc, `role="alert"` e `role="status"`; senha limpa depois de erro ou sucesso; sucesso zera o cartão e limpa os rascunhos; sem `window.confirm`.

Fechamento: suíte completa do backend e das duas telas, `build:coord`; Chrome real com backend em banco temporário (portas 3100/4100, nunca `C:\ProgramData`) em 375 e 1280: fluxo completo, flag desligada sem rastro do cartão, e a prova de que os arquivos de `uploads/` e os backups realmente sumiram.

## Riscos

- **Operação irreversível:** mitigada por quatro barreiras (modo secundário no `config.json`, primeiro admin, senha e frase digitada) e por apagar o disco só depois do commit. Custo se o desenho estiver errado: perda de dados de teste; nunca de usuários nem do mapa.
- **Apagar as cópias de segurança por padrão** remove a única rede de segurança: por isso a caixa é visível, explicada e desmarcável.
- **Ligar a chave por engano numa implantação real** é o maior risco: a documentação e o `LEIA-ME` dizem em destaque que a chave só vale para instalações de teste, e a tela deixa o modo explícito no título do cartão. O instalador não liga a chave sozinho.
- **Dados residuais no SQLite:** mitigado por `VACUUM` e checkpoint do WAL, com teste de bytes.
- **Sessões e telas abertas de outros coordenadores** passam a ver "não encontrado": esperado e avisado pelo `publicar`.
