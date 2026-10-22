# Acolhimento e organização das conversas

O usuário pediu histórico de casos no navegador, orientação de denúncia, foco direto no chat, acolhimento sem questionário/dados escolares e filtros de mensagens na coordenação. Delegou decisões e aprovações durante a execução.

- A antiga restrição de não armazenar códigos foi substituída explicitamente pelo histórico local `tetra-guard.acessos.v1` (codigo e lastRead). Sem conteúdo de conversas nem códigos na URL; remoção na tela inicial. PRODUCT.md atualizado.
- POST /api/acolhimento reutiliza recibos v3: caso, primeira mensagem e recibo são gravados na mesma transação. `casos.canal` distingue acolhimento de relato sem exigir dados escolares inventados.
- A leitura usa ID crescente de mensagem, por caso/usuário da equipe. GET detalhe não marca leitura; POST conversa/lida só avança até ID exibido. IDs também são expostos ao aluno, sem autoria interna.
- Exportação autenticada é HTML escapado para cópia/impressão, de apoio ao preenchimento manual. Não prometer importação oficial ROE: não há modelo fornecido. Notas internas e códigos ficam de fora.
- Python da Windows Store/venv não iniciou no sandbox; testes funcionaram com execução escalada. Vitest com muitos workers saturou a máquina; limitar maxWorkers=1. Chrome instalado funciona para Playwright com channel chrome, sem baixar Chromium.
- O checkout já continha muitas mudanças não commitadas; foram preservadas, sem commits ou alteração de branch.

Escopo e decisões: docs/superpowers/specs/2026-10-20-acolhimento-conversas-design.md. Guia de uso: docs/acolhimento-e-conversas.md.
