# Organização do atendimento

Pedido aprovado: implementar responsável, próxima ação com prazo e fila de atenção. Complemento do usuário: distinguir resolvidos, casos que precisam de atenção e casos ainda não abertos.

- Preservar LAN, dados, códigos, aparência existente e separação entre aluno e equipe.
- Responsável opcional, escolhido entre usuários ativos; contas desativadas continuam identificáveis e geram pendência de reatribuição em casos abertos.
- Uma próxima ação interna por caso, até 500 caracteres, com data obrigatória. Permitir concluir ou remover a ação com histórico. Permitir ações de acompanhamento em resolvidos.
- Data é um dia de calendário no fuso America/Sao_Paulo; vence após o término desse dia.
- Visualizações em Casos: Todos, Ainda não abertos, Precisam de atenção e Resolvidos. Filtros adicionais por motivo de atenção. Contagens refletem os demais filtros e atualizam automaticamente.
- Não aberto significa ausência de ultimo_acesso_em, independente do status.
- Atenção: caso aberto sem responsável ativo, aberto sem primeira mensagem da coordenação, última mensagem do aluno sem resposta, ação vencida ou recorrência pendente. Resolvidos com mensagem, recorrência ou ação vencida entram na atenção.
- Atribuição e ação usam revisão otimista, evento interno e atualização em tempo real. Abrir o caso não responde mensagens nem conclui ações.
- Migração aditiva com backup anterior; não atribuir retroativamente casos antigos.

Decisões de implementação: manter a navegação Pós-resolução existente e acrescentar os recortes na fila; não criar notificações externas ou prazo automático para a equipe.

## Complemento solicitado durante a execução

A planta deve permitir continuar a adicionar blocos além da área inicial de visualização. Área inicial de 1200 × 800, ampliável em passos de 400 unidades até 12000 × 8000 em cada nível. Scroll interno horizontal/vertical com overflow automático e altura limitada à janela; barras desaparecem quando o conteúdo cabe ao afastar o zoom. A API aceita as novas coordenadas. Posições antigas e hierarquia permanecem válidas. Área ampliada vazia é transitória; depois de salvar, os limites necessários são reconstruídos pelos ambientes persistidos. Em celular, o espaço vazio permite deslizar; desenho e manipulação dos blocos reservam o gesto de edição.
