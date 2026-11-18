# TETRAGUARD: padrões, orientação imediata, trilha de evidências e alertas

Data: 17/11/2026. Origem: o usuário escolheu quatro ideias de uma lista de inovações (1, 3, 6 e 7). Contexto de implantação: sistema hospedado para uma única escola (ver `PRODUCT.md`, ainda com texto da LAN). Provedor e infraestrutura não foram informados; nenhuma parte desta spec presume um deles.

## Princípios

- Anonimato do aluno é preservado: nenhuma das quatro frentes pode revelar identidade nem permitir inferi-la sozinha.
- Triagem, prioridades e alertas fixos da v2 A não mudam. Tudo aqui é aditivo.
- Sem IA decidindo: regras fixas, textos revisados por pessoas.
- O portal do aluno segue neobrutalista (creme, coral e limão); a coordenação segue a identidade verde com a animação de metal líquido.
- Migrações só com backup `.pre-*.bak` (padrão já usado) e ensaiadas em cópia.

## Frente 1: padrões antes dos casos

**Problema.** A coordenação vê caso a caso. O mapa e os relatórios mostram contagens, mas ninguém é avisado de que três relatos caíram no mesmo lugar e horário.

**Comportamento.**
- Um cálculo (função pura sobre os casos existentes) agrupa relatos recentes por local do mapa, tipo de situação, faixa de horário e dia da semana, e por recorrência.
- Um padrão existe quando 3 ou mais casos distintos coincidem em local + tipo, ou local + faixa de horário, dentro de 21 dias (limiares configuráveis, valores iniciais acima).
- Cada padrão aparece na Visão geral como cartão "Padrão observado" com contagem, período, link para os casos e um texto neutro ("3 relatos no pátio, sexta de manhã, em 14 dias"). Nunca mostra texto do relato nem dados do aluno.
- A coordenação pode marcar o padrão como "em acompanhamento" ou "descartado"; padrão descartado só reaparece se crescer em pelo menos 2 casos.
- Resultado alimenta o realce do mapa existente.

**Limite de privacidade.** Com poucos casos o agrupamento pode apontar um aluno. Só exibir padrões com no mínimo 3 casos e agrupando por local/horário; nunca por série, turma ou ano quando houver menos de 5 casos no grupo.

## Frente 3: orientação imediata ao aluno

**Problema.** Depois de enviar, o aluno espera a resposta da escola sem receber ajuda prática.

**Comportamento.**
- A tela de confirmação passa a mostrar um bloco "Enquanto você espera" com passos práticos conforme as situações marcadas (ex.: guardar prints sem apagar conversas, bloquear e não responder, quem procurar na escola, onde pedir apoio emocional).
- Conteúdo vem de um arquivo versionado (`orientacoes.json`) com um bloco por situação do questionário e um bloco geral. Os textos são rascunho meu para revisão do usuário e da escola.
- A tela de orientação de risco já existente (`q6.nao`/`q6.hoje`) continua com prioridade; esta frente a complementa.
- Os mesmos passos ficam acessíveis em "Acompanhar" com o código do caso, sem expor outros dados.
- Contatos de apoio da escola vêm de configuração (pendência do usuário); se vazios, o bloco os omite sem inventar números.

**Fora do escopo.** Aconselhamento personalizado, texto gerado, qualquer resposta que dependa de análise do relato livre.

## Frente 6: trilha de evidências com cadeia de custódia

**Problema.** Anexos têm só nome interno, tipo e tamanho. Para entregar a família ou a autoridades é preciso mostrar que o arquivo não foi alterado e quem o viu.

**Comportamento.**
- Ao salvar um anexo (depois da remoção de metadados que já existe), registrar SHA-256 do conteúdo salvo e data/hora de recebimento no servidor.
- Registrar cada acesso da coordenação a um anexo (quem, quando, ação: visualizar ou exportar) em tabela própria, imutável pela interface.
- Exportar "Dossiê do caso" em PDF: dados do caso permitidos pela política atual, cronologia, lista de anexos com hash e carimbo, registro de acessos e uma conferência que recalcula o hash dos arquivos no momento da exportação.
- Sinalizar na tela do caso quando o hash recalculado de um anexo não bate com o registrado.
- Registros legados sem hash aparecem como "sem registro de integridade", sem preencher retroativamente a data de recebimento.

**Decisões pendentes do usuário.** Quem pode exportar o dossiê (sugestão: admin e o responsável do caso); se o dossiê inclui texto do relato; anexos da resolução (decisão de segurança adiada desde a v2 A). A spec implementa só os anexos de denúncia e deixa a resolução fora.

**Aviso de escopo.** O carimbo é do servidor da escola, não de terceiro confiável. Não chamar de prova legal; o rótulo do PDF diz "registro de integridade".

## Frente 7: alertas por canal

**Problema.** Casos críticos só são vistos se alguém abrir o painel. Como o sistema agora é hospedado, notificar fora do painel é viável.

**Comportamento.**
- Evento de caso novo com prioridade Crítica, e recorrência pendente de revisão, geram uma notificação.
- Mensagem sem dados pessoais: "Novo caso crítico no TETRAGUARD. Abra o painel para ver." com link para a coordenação. Nunca inclui código, texto, local ou prioridade detalhada além de "crítico".
- Primeiro canal: e-mail por SMTP configurável pela escola. A abstração `Canal` permite acrescentar WhatsApp institucional depois, mas WhatsApp fica fora desta entrega (provedor e conta não informados).
- Cada usuário da coordenação escolhe receber ou não, e administradores definem o endereço de cada um. Envio em fila com repetição limitada; falha de envio nunca bloqueia nem atrasa o recebimento do caso.
- Resumo diário opcional dos casos parados sem primeira resposta.
- Registro dos envios (sem conteúdo) para auditoria.

**Decisões pendentes do usuário.** Provedor SMTP e remetente; quais usuários recebem; horário do resumo.

## Ordem sugerida

1 e 3 usam dados e telas que existem e têm baixo risco. Fazer primeiro 3 (conteúdo dependente de revisão), depois 1. A 7 vem em seguida, pois só precisa de configuração de e-mail. A 6 vem por último por tocar banco, arquivos e política de acesso.

## Verificação

Suíte do backend, suítes dos dois portais, contraste, build, e navegador real em 375, 768 e 1280 nos temas claro e escuro. Teste de privacidade para cada frente: nenhuma resposta nova de API do aluno contém dados da coordenação e nenhuma notificação contém texto de relato.
