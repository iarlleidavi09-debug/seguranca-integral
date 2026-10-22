# Validação de acolhimento e conversas — 20/10/2026

- Portal do aluno: suíte completa, 22 arquivos e 241 testes aprovados. Acompanhar reexecutado após adicionar o teste de visibilidade: 25 testes aprovados.
- Coordenação: suíte completa com maxWorkers=1, 21 arquivos e 216 testes aprovados. Execução focal Fila/Caso: 71 testes aprovados.
- Builds de produção aluno e coordenação concluídos com verificação TypeScript.
- `frontend/verificacao/acolhimento-conversas.mjs`: Chrome real em 375 e 1280 pixels para os dois portais. Acolhimento sem identidade, foco na conversa, mensagem nova, retorno pelo histórico, remoção, filtro da coordenação, leitura só na aba conversa e link de exportação aprovados. Sem rolagem horizontal nas telas verificadas.
- A verificação no navegador utiliza respostas de API simuladas. Persistência, recibos e autorização foram verificados separadamente nos testes reais de backend com bancos temporários.
- Inspeção das capturas mobile/desktop concluída preservando o visual implementado de cada portal.
- Detector Impeccable nos componentes alterados retornou lista vazia de achados.
- `git diff --check` nos arquivos desta mudança não encontrou erros de whitespace. O checkout possui mudanças anteriores fora deste escopo.

O Chromium do pacote Playwright não estava instalado; o teste usa o Chrome já instalado, sem downloads. A execução inicial com muitos workers atingiu limite de inicialização; as suítes finais foram executadas com concorrência limitada.

## Backend

- Regressão de conversas, coordenação e banco: 365 testes aprovados; resumo em `validacao-acolhimento-backend.txt`.
- Acolhimento/exportação: 11 testes aprovados, incluindo recibo sem duplicação, entrada inválida, anonimato, autorização e escape HTML. O teste de exportação foi reexecutado e aprovado após traduzir o rótulo do desfecho.
- Privacidade das mensagens do aluno: teste específico aprovado, mantendo o ID sem expor autoria interna.

Foram executadas as regressões pertinentes do backend; esse conjunto não representa todos os testes existentes no repositório.
