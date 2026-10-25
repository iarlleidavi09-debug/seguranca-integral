# Verificação: portal do estudante, Início e Conversa (22 a 25/10/2026)

Spec: `docs/superpowers/specs/2026-10-22-portal-estudante-inicio-conversa-design.md`. Plano: `docs/superpowers/plans/2026-10-22-portal-estudante-inicio-conversa.md`.

## Suítes e builds

| Verificação | Resultado |
| --- | --- |
| Portal do aluno, Vitest com `--maxWorkers=1` | 28 arquivos, 348 testes aprovados (um teste de visibilidade da página dependia de tempo sob carga e foi estabilizado) |
| Coordenação, Vitest com `--maxWorkers=1` | 22 arquivos, 238 testes |
| `npm run build:aluno` e `npm run build:coord` | aprovados, com `tsc` |
| Backend: `test_empacotamento.py` e `test_server.py` | 80 aprovados (o backend não mudou nesta etapa) |

## Medidas no Chrome (Playwright, canal chrome)

| Medida | Antes | Depois |
| --- | --- | --- |
| Início em 375 px, sem casos salvos | 3.810 px | 1.867 px (meta até 1.900) |
| Conversa em 375 px | 2.128 px com 5 mensagens | 1.822 px com 8 mensagens |
| Campo de resposta fixo, 2 linhas, 375 px | 223 px | 151 px; 247 px com 6 linhas |
| Campo de código no Início | 30 px em 768 px | 293, 676, 273 e 299 px em 375, 768, 1024 e 1280 |
| Campo fixo antes, logo após e 1 s depois do envio | cresceu 32 px com a confirmação | 151 px nos três instantes |

Verificado, sem rolagem horizontal em 375, 768 e 1280:
- O separador "Novas mensagens" e a contagem seguem estáveis com o stream ativo, e a rolagem acontece só ao abrir e ao enviar.
- A mensagem enviada fica 100% visível acima do campo em 375x812, 375x480 e 768x1024.
- Quando o armazenamento do navegador falha, o código do caso aparece sem abrir nada.
- O indicador +/- muda com Enter e Espaço nos blocos recolhíveis.
- O botão "Atualizar conversa" só aparece fora do ar ou depois de uma falha de leitura.

## Limitações e decisões

- Nas últimas rodadas o backend real não pôde subir no contexto do verificador (Python da Microsoft Store com erro 1920 apenas lá). Usou-se um servidor simulado em Node, com as mesmas rotas e eventos, servindo o bundle real do aluno. Vale para layout e comportamento do front.
- Em 375x480 (teclado aberto) com duas mensagens novas, a segunda fica 4 px sob a borda do campo. Texto e hora aparecem.
- No caminho de falha de releitura o campo chega a 315 px (aviso e botão) e a 267 px com erro 429. É raro e o conteúdo continua acessível por rolagem.
- `frontend/verificacao/navegador.mjs` não roda até o fim: é anterior ao fluxo v3 e seu mock não tem o endpoint de perguntas. `aluno.mjs` só passou em `node --check`, porque usa o backend real. `acolhimento-conversas.mjs` foi executado e passou.
- O tema do portal do aluno é só claro.
- O Setup em `dist\` não foi regenerado com estas mudanças.
