# Plano: padrões, orientação, evidências e alertas

> Spec: `docs/superpowers/specs/2026-11-17-inovacoes-padroes-orientacao-evidencias-alertas.md`.
> Execução: subagentes sonnet por tarefa (sem opus, limite semanal), um implementador e um revisor por tarefa, testes focados em cada uma e suíte completa só na tarefa final. Backend com `backend/.venv/Scripts/python.exe -m pytest`; frontends com `node node_modules/vitest/vitest.mjs run --config vite.<portal>.config.ts --pool=threads --maxWorkers=1 --no-isolate`.
> Regras: TDD, texto novo sem travessão longo, comentários em português, nenhum push.

## Fase 0: pré-requisitos (antes de qualquer frente)

- [ ] 0.1 Commitar o estado atual (paleta do aluno e metal líquido restaurados) para que cada frente parta de uma base limpa.
- [ ] 0.2 Decidir com o usuário: remetente/SMTP, quem exporta dossiê, contatos de apoio, revisão dos textos de orientação. Registrar rulings no ledger `.superpowers/sdd/2026-11-17-inovacoes/progress.md` (git-ignored).
- [ ] 0.3 Atualizar `PRODUCT.md` e `docs/operacao-lan.md` para o contexto hospedado de uma escola (sem presumir provedor).

## Fase 1: Frente 3, orientação imediata (backend leve, front do aluno)

- [ ] 1.1 `backend/app/orientacoes.json` com bloco geral e um por situação do questionário (rascunho para revisão); validação de formato ao carregar.
- [ ] 1.2 `GET /api/orientacoes?situacoes=...` no portal do aluno: devolve só os blocos pedidos, sem dados do caso. Testes: situação desconhecida, vazio, tamanho máximo de lista.
- [ ] 1.3 Confirmacao.tsx: bloco "Enquanto você espera" abaixo da orientação de risco, que mantém a prioridade. Testes de renderização com e sem risco e sem contatos configurados.
- [ ] 1.4 Acompanhar.tsx: mesmos passos acessíveis pelo código. Verificar que a resposta de acompanhamento não ganha campos da coordenação.
- [ ] 1.5 Navegador real: 375/768/1280, claro e escuro, paleta coral/limão.

## Fase 2: Frente 1, padrões observados

- [ ] 2.1 `backend/app/padroes.py`: função pura `detectar_padroes(casos, hoje, limiares)` com agrupamento por local+tipo e local+faixa de horário, janela de 21 dias, mínimo de 3 casos, regra de privacidade (nunca por turma abaixo de 5). Testes de limiares, fronteira de datas e agrupamento mínimo.
- [ ] 2.2 Tabela `padroes_estado` (chave do padrão, estado `acompanhando|descartado`, contagem na decisão); migração com backup `.pre-v4.bak`, ensaiada em cópia. Reaparece só com +2 casos.
- [ ] 2.3 `GET /api/coord/padroes` e `POST /api/coord/padroes/<chave>/estado` com autorização e limitação de taxa. Testes de papel e de não vazar texto de relato.
- [ ] 2.4 Visão geral: cartão "Padrão observado" com links para os casos; realce no mapa. Testes e verificação visual na coordenação (animação de metal intacta).

## Fase 3: Frente 7, alertas por canal

- [ ] 3.1 `backend/app/notificacoes.py`: interface `Canal`, implementação SMTP com configuração em `config.json`; mensagem fixa sem dados pessoais. Testes com servidor SMTP falso.
- [ ] 3.2 Tabela `preferencias_alerta` por usuário e `envios_alerta` (sem conteúdo). Fila em segundo plano com tentativas limitadas; falha nunca bloqueia a criação do caso.
- [ ] 3.3 Gatilhos: caso Crítico novo, recorrência pendente, resumo diário opcional. Testes de que o texto enviado nunca contém código, relato ou local.
- [ ] 3.4 Tela de preferências na coordenação (Ferramentas) e campo de e-mail do usuário para admin. Testes de papéis.

## Fase 4: Frente 6, trilha de evidências

- [ ] 4.1 Migração com backup: colunas `sha256` e `recebido_em` em `anexos` (nulas nos legados) e tabela `acessos_anexo`. Ensaio em cópia antes de aplicar.
- [ ] 4.2 `uploads.salvar_anexo` calcula hash depois da limpeza de metadados; testes com os formatos suportados e verificação de que o hash corresponde ao arquivo gravado.
- [ ] 4.3 Registro de acesso na rota de anexos da coordenação; tabela sem rotas de edição. Teste de que nem admin apaga o registro pela API.
- [ ] 4.4 Exportação "Dossiê do caso" em PDF com cronologia, anexos, hash, carimbo e registro de acessos; recalcula hash na hora. Rótulo "registro de integridade".
- [ ] 4.5 Tela do caso: indicador de integridade e botão de exportar conforme o ruling de quem pode.
- [ ] 4.6 Revisão de segurança por subagente sonnet focada em caminhos de arquivo e permissões.

## Fase 5: fechamento

- [ ] 5.1 Suíte completa do backend e dos dois portais, TypeScript, build, contraste.
- [ ] 5.2 Roteiro em navegador real com banco temporário e dados fictícios, 375/768/1280, claro e escuro; console sem erros.
- [ ] 5.3 Verificação de privacidade das quatro frentes (testes de contrato das respostas e das notificações).
- [ ] 5.4 Atualizar documentação, vault do Obsidian (uma nota por frente, com links e hubs) e learnings; gerar novo instalador só se o usuário pedir.
- [ ] 5.5 Listar todos os rulings na ordem, com o custo se estiverem errados.

## Riscos

- Padrões podem apontar um aluno em escola pequena: regra de mínimo de casos e nada de turma/ano abaixo de 5.
- E-mail é canal externo: mensagem sem dados pessoais e com link; falha silenciosa não pode perder o caso.
- Carimbo do servidor não é prova legal: rótulo e documentação deixam isso explícito.
- Migrações tocam o banco real: sempre backup verificado e ensaio em cópia.
