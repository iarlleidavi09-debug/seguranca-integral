# Coordenação: menos controles simultâneos

Solicitação direta do usuário: deixar a coordenação mais profissional e reduzir a quantidade de botões, recolhendo ações secundárias.

## Direção

- Manter Visão geral, Meu atendimento e Casos como destinos principais.
- Agrupar Pós-resolução, Mapa e Relatórios em Organização; Usuários e Ensaio em Ferramentas, respeitando os papéis existentes.
- Usar disclosure nativo com rótulos claros. Abrir o grupo da tela selecionada; pendências de pós-resolução devem permanecer perceptíveis mesmo com o grupo fechado.
- Na fila, manter busca e contexto atual visíveis; recolher visões alternativas e filtros complementares, com indicação de filtros ativos.
- No caso, reunir gestão e ações secundárias em um ponto de entrada claro; preservar conversa, envio de mensagem, pendências e informações essenciais.
- No mapa, recolher ajustes de visualização e ferramentas avançadas; manter salvar/cancelar visíveis durante a edição e não esconder erros/conferência.
- Nos relatórios, reduzir a seleção de visualização a um seletor e reunir exportação; manter números e gráfico visíveis.
- Preservar os dados e todos os controles existentes, seus contratos e rascunhos. Recolher conteúdo não deve desmontar formulários nem apagar entradas.
- Não alterar o portal do aluno, nem APIs, permissões, comportamento de resolução ou regras de prioridade.
- Manter a identidade verde/neutra, tema escuro, padding de16px e acessibilidade por teclado.

## Verificação

Testar disclosure aberto/fechado, destino atual, contador de pendências, permissões, manutenção de rascunhos, expansão das ações e seletores de relatório. Executar a suíte da coordenação, TypeScript/build, contraste e navegação a375/768/1280 nos dois temas. Atualizar a demonstração local após o build, sem publicação remota.
