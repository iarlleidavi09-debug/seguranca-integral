# Coordenação Fluent — verificação em 19/10/2026

Interface aplicada ao portal da coordenação: Segoe UI, superfícies neutras, ações azuis, menu lateral com ícones e seleção Fluent. O portal do aluno mantém o tema neobrutalista aprovado.

Relatórios: GET /api/relatorios exige a sessão existente. Consulta agregada no SQLite, período de até 366 dias, dias no horário de Brasília, simulações excluídas. Recebidos contam entradas no período; resolvidos contam a primeira resolução de cada caso no período, inclusive entradas anteriores. Não são enviadas identidades, relatos, notas ou anexos.

Exportações: CSV UTF-8 com BOM e separador ponto e vírgula, compatível com Excel, contendo os totais diários do filtro aplicado. PDF pela impressão do navegador. Não gera arquivo XLSX nativo.

Validação: build:coord concluído; 211 testes existentes da coordenação passaram; 2 testes novos da interface de relatórios passaram; 4 testes do backend de relatórios passaram. Chrome real: larguras 375, 768 e 1440 sem overflow horizontal da página; CSV 200; sem erros JavaScript. Gráfico móvel tem rolagem interna e tabela acessível com valores diários.

Prévia isolada: http://127.0.0.1:14001, com dados fictícios em build/preview-fluent-dados. Capturas e PDF em frontend/verificacao/fluent-*. Nenhuma instalação ou atualização da instância real foi executada nesta etapa. O instalador anterior não inclui estas mudanças; precisa ser recompilado para distribuição.

Motion: transição de navegação de 200 ms, feedback dos controles e revelação inicial dos gráficos. Menu com bolhas SVG de metal líquido, botão de pausa, pausa ao ocultar a aba/sair da tela e alternativa estática com prefers-reduced-motion. Build e 20 testes de App/Relatórios passaram. Chrome real confirmou pausa/retomada, redução de movimento e ausência de overflow móvel. Capturas: frontend/verificacao/fluent-metal-1440.png e fluent-metal-375.png.
