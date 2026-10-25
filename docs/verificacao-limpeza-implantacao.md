# Verificação: limpeza da implantação secundária (25/10/2026)

Spec: `docs/superpowers/specs/2026-10-25-limpeza-implantacao-secundaria-design.md`. Plano: `docs/superpowers/plans/2026-10-25-limpeza-implantacao-secundaria.md`.

## Suítes completas

| Verificação | Resultado |
| --- | --- |
| Backend, `pytest backend/tests` da raiz | 1184 aprovados e 1 pulado (o teste de link simbólico real, que o Windows não cria sem privilégio; há um teste de link simulado) |
| Coordenação, Vitest com `--maxWorkers=1` | 24 arquivos, 254 testes (62 nos arquivos da limpeza e da casca depois do ajuste final) |
| Portal do aluno, Vitest com `--maxWorkers=1` | 28 arquivos, 348 testes |
| `npm run build:coord` e `npm run build:aluno` | aprovados, com `tsc` |

## Chrome real (Playwright, backend real, banco temporário, portas 3100 e 4100)

- **Instalação normal** (sem a chave): a tela Usuários não mostra o cartão. `GET` e `POST /api/implantacao` dão 404 para o primeiro admin e para um segundo admin, e 403 da portaria para o coordenador.
- **Instalação secundária:** o cartão aparece só para o primeiro admin, com as contagens e o texto da spec. Segundo admin e coordenador recebem 403 e não veem nada.
- **Painel:** o foco vai para Senha ao abrir, "Apagar tudo" fica desabilitado com a frase errada (também com minúsculas), Esc cancela e devolve o foco, e senha errada mostra "A senha está incorreta." sem apagar e com o campo de senha esvaziado.
- **Limpeza com as cópias marcadas:** mensagem de sucesso com as contagens, contagens zeradas e foco no título do cartão. No disco: `uploads\` sem arquivos, `backups\` sem subpastas, nenhum `seguranca.db.pre-*.bak`, `config.json`, `secret.key`, `sessao.key` e o banco mantidos. Usuários intactos (o admin entra de novo), mapa intacto, lista de casos vazia e o primeiro caso novo recebe o id 1.
- **Privacidade física:** um marcador único gravado em relato e mensagem estava presente nos bytes de `seguranca.db` antes e ficou ausente depois, também em `-wal` e `-shm`.
- **Com as cópias desmarcadas:** as cópias continuam no disco e os casos somem.
- **Aluno depois da limpeza:** o código antigo dá o "não encontrado" normal.

## Defeitos encontrados e tratados

- Alvos de toque do painel com 37 e 39 px em 375 px e botão colado ao parágrafo: corrigidos (`min-height: 44px` e espaçamento).
- Contagem de cópias zerava mesmo com a caixa desmarcada: corrigida e coberta por teste.
- Outra aba de coordenador aberta num caso apagado mantém o texto antigo até recarregar (depois mostra "Não encontrado"): aceito, pois o 404 em segundo plano é silencioso.

## Limitações

- O teste de bloqueio por 5 senhas erradas não foi feito no navegador, porque travaria o login do único primeiro admin; ele está coberto nos testes do backend. Cinco senhas erradas no cartão bloqueiam também o login do admin (mesmo contador).
- A chave `implantacao_secundaria` se liga editando o `config.json`; o instalador não a liga sozinho e a documentação destaca que ela só vale para instalações de teste.
- O Setup em `dist\` não foi regenerado com estas mudanças.
