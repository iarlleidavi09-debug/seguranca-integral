# Acolhimento e acompanhamento

## Portal do aluno

Na página inicial, **Preciso de ajuda** inicia a denúncia com orientações. **Conversar sem me identificar** abre um campo de mensagem sem questionário, nome, ano ou turma. O atendimento nasce quando a primeira mensagem é enviada.

O início tem três cartões de ação: **Preciso de ajuda**, **Conversar sem me identificar** e **Ver meu caso**, onde o aluno digita o **Código de acompanhamento** e toca em **Acompanhar**. Abaixo ficam a linha de privacidade, o bilhete e os blocos recolhíveis **Como funciona** e **Seus dados e privacidade**.

Casos criados ou consultados com sucesso ficam em **Continuar meu caso**. O histórico contém o código e o marcador de leitura, sem copiar o relato ou a conversa. Pode-se abrir, apagar um acesso ou apagar todos. Apagar um acesso não apaga o atendimento na escola. Navegadores e aparelhos diferentes possuem históricos separados.

O código permite reabrir o caso; quem usa o mesmo navegador pode usar o acesso salvo. Quando o armazenamento está bloqueado, o atendimento continua funcionando e o aluno pode anotar o código exibido na conversa.

Ao acompanhar, a tela leva o foco para **Conversa com a coordenação**, mostra a conversa em formato de chat, com um único separador **Novas mensagens** antes das respostas ainda não vistas (não há mais o rótulo **Mensagem nova** em cada balão) e confirma o envio das mensagens. O código fica em **Seu código**, recolhido. O botão **Atualizar conversa** só aparece quando a conexão cai ou a leitura falha. A resposta fica fixa no rodapé. A página oculta não avança o marcador de leitura.

## Coordenação

O filtro **Conversa** na fila permite ver somente casos com mensagens ou selecionar:

- **Sem mensagem:** o chat ainda não foi usado.
- **Mensagem nova:** há mensagem do aluno que essa conta da equipe ainda não leu.
- **Aguardando resposta da equipe:** a última mensagem é do aluno e já foi lida.
- **Aguardando resposta do aluno:** a última mensagem é da coordenação.

A fila mostra a prévia, autor, horário e quantidade de mensagens novas. Atendimentos diretos têm o selo **Acolhimento anônimo**. A leitura só é registrada ao abrir a aba **Conversa** em uma página visível. Cada conta possui sua própria leitura; uma mensagem que chegou depois do conteúdo exibido continua nova.

## Relatório de apoio ao ROE

No detalhe do caso, **Exportar para preenchimento do ROE** abre um relatório para copiar ou imprimir/salvar como PDF pelo navegador. É necessário estar autenticado na coordenação.

O relatório contém dados disponíveis do caso, relato, providências, desfecho e conversa. Dados ausentes aparecem como não informados. Não inclui código de acesso nem notas internas.

Não é um arquivo de importação oficial. A compatibilidade com ROE depende de obter e validar o modelo exigido pela escola.

## Editar e excluir mensagens enviadas ao aluno

Em cada mensagem que a coordenação enviou, quem a escreveu (e o administrador) vê **Editar** e **Excluir**. Não há limite de tempo.

- Editar troca o texto no lugar. O aluno passa a ver o texto novo com "(editada)". O texto anterior fica guardado apenas para a coordenação, em **Ver versões**.
- Excluir pede confirmação na própria mensagem. O aluno e a equipe passam a ver "Mensagem apagada" no lugar do texto; o texto original fica guardado só para a coordenação, em **Ver texto original**.
- Mensagens do aluno não podem ser alteradas. Outro coordenador não altera mensagens alheias.
- Cada edição ou exclusão aparece no histórico do caso ("Mensagem editada por X", "Mensagem apagada por X"), sem repetir o texto.
- O aluno nunca recebe o horário da edição, quem editou, as versões nem o texto apagado.
- Uma mensagem apagada da coordenação ainda conta como resposta da equipe na fila de atendimento, porque a equipe de fato respondeu.

A inicialização normal do backend acrescenta as colunas e a tabela de versões ao banco existente, sem perder mensagens. Reinicie o serviço para carregar as novas rotas. Verificação: `docs/verificacao-editar-excluir-mensagens.md`.

## Instalação

Os dois portais foram recompilados. A inicialização normal do backend cria a tabela de leituras e acrescenta o canal aos casos existentes, preservando seus códigos e mensagens. Reinicie o serviço para carregar as novas rotas e a migração. O instalador executável ainda precisa ser reconstruído se a distribuição ocorrer por esse formato.

## Verificação no navegador

Com os servidores Vite em 15173 (aluno) e 15174 (coordenação), execute `node verificacao/acolhimento-conversas.mjs` dentro de frontend. O teste usa APIs simuladas, sem criar casos no banco escolar, e verifica os dois portais em 375 e 1280 pixels. Testes de API separados verificam persistência, autorização e recibos reais em bancos temporários.
