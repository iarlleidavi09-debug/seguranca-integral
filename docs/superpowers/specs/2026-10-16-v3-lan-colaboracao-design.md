# v3: pedidos de ajuda, colaboração e operação na LAN

Data: 16/10/2026. Estado: escopo completo aprovado explicitamente pelo usuário, incluindo pesos provisórios. Implementação e revisão independente concluídas; instalador LAN 3.0.0 gerado. Evidências e limites em [Verificação v3](../../verificacao-v3.md).

## Origem e decisões confirmadas

O usuário pediu expansão dos portais, melhoria da interface, responsabilidade em tempo real, operação somente na LAN com CLI de estado, reconstrução das bifurcações e do portal do aluno. Pediu selecionar e agrupar as situações necessárias da lista fornecida; cada opção terá peso e bifurcações.

Em 16/10, aprovou a organização apresentada na prévia navegável: oito grupos colapsáveis, seleção múltipla entre grupos, perguntas comuns sem repetição, aprofundamentos relacionados, relato e revisão. A prévia demonstra mensagens, recorrência, colaboração e CLI com dados fictícios; não é implementação desses recursos.

As escolhas técnicas, pesos, faixas e regras abaixo foram apresentadas e aprovadas para o protótipo no escopo completo. Os pesos permanecem provisórios e editáveis.

## Resultado esperado

Um aluno descreve o que aconteceu sem precisar conhecer nomes de crimes. Pode escolher várias situações relacionadas, responder somente ao aprofundamento pertinente, escrever o relato, anexar provas opcionais e conversar anonimamente com a equipe. A coordenação entende a prioridade, enxerga a presença dos colegas e acompanha alterações sem recarregar a página. O operador confere a saúde do servidor na CLI.

Manter React/TypeScript/Vite, Flask/gevent, SQLite e empacotamento Windows. Implementar no projeto existente. Não contratar serviço externo nem instalar outro banco.

## Categorias e opções

Descrições representam relatos, sem atribuir uma classificação jurídica automática. A coordenação pode corrigir a prioridade com justificativa. Pessoas envolvidas podem ser alunos, professores, funcionários, familiares ou outras pessoas; não criar cópias de cada situação por papel da vítima ou de quem a pratica.

Peso-base provisório de cada opção, inteiro de 1 a 5:

| Grupo | Opção apresentada ao aluno | Peso | Família de aprofundamento |
| --- | --- | ---: | --- |
| Humilhação, bullying e discriminação | Humilhações, apelidos ou exclusão repetida | 2 | social |
| mesmo grupo | Ataques, boatos ou exposição na internet | 2 | social |
| mesmo grupo | Ofensas ou tratamento desigual por quem eu sou | 3 | discriminação |
| Ameaças, perseguição e pressão | Ameaça de machucar alguém | 4 | ameaça |
| mesmo grupo | Alguém me segue ou insiste em me procurar | 3 | ameaça |
| mesmo grupo | Pressão ou chantagem para fazer algo | 4 | pressão |
| mesmo grupo | Exigem dinheiro ou algo meu usando ameaças | 4 | pressão |
| Contato ou exposição sexual | Comentários, mensagens ou convites sexuais indesejados | 4 | sexual |
| mesmo grupo | Contato sexual ou toque sem consentimento | 5 | sexual |
| mesmo grupo | Pedidos de segredo, fotos íntimas ou encontros | 5 | sexual |
| mesmo grupo | Gravaram ou compartilharam minha intimidade | 5 | intimidade |
| mesmo grupo | Pressão ou troca de favores envolvendo algo sexual | 5 | sexual |
| Agressão e violência | Agressão, briga ou ferimento | 4 | violência |
| mesmo grupo | Machucaram, prenderam ou impediram alguém de sair | 5 | violência |
| mesmo grupo | Tentaram matar alguém ou houve uma morte | 5 | violência |
| Privacidade, contas e golpes | Divulgaram dados, conversas ou gravações particulares | 3 | digital |
| mesmo grupo | Invadiram uma conta ou dispositivo | 3 | digital |
| mesmo grupo | Criaram um perfil falso ou se passaram por alguém | 2 | digital |
| mesmo grupo | Link, pagamento ou oportunidade suspeita | 3 | golpe |
| Pertences e espaço da escola | Pegaram ou levaram pertences de alguém | 2 | pertences |
| mesmo grupo | Danificaram o espaço ou os equipamentos da escola | 2 | patrimônio |
| Risco coletivo e substâncias | Arma ou objeto usado para intimidar | 5 | coletivo |
| mesmo grupo | Ameaça de ataque, bomba ou incêndio na escola | 5 | coletivo |
| mesmo grupo | Venda, oferta ou pressão para usar drogas ou álcool | 4 | substâncias |
| mesmo grupo | Suspeita de algo colocado em comida ou bebida | 5 | coletivo |
| Cuidado em casa e atuação de adultos | Violência ou falta de cuidado em casa | 4 | cuidado |
| mesmo grupo | Um adulto da escola machuca, constrange ou discrimina | 4 | cuidado |
| mesmo grupo | Pedi ajuda a um adulto e continuo sem proteção | 3 | cuidado |
| mesmo grupo | Pressão para participar de atividades criminosas | 5 | pressão |
| Fora dos grupos | Não encontrei minha situação / relato livre | 1 | comum |

Injúria, difamação, calúnia e falsa acusação ficam nas descrições de ofensas/boatos. As discriminações ficam em um aprofundamento. Formas graves de violência ficam no grupo correspondente. Não abrir fluxos próprios de fraude em avaliação, assinatura, documento ou acesso a sala restrita nesta entrega: podem ser relatados em Outra situação. Evitar um catálogo de dezenas de termos técnicos.

## Questionário: estrutura e regras

Uma definição canônica JSON com grupos, opções, perguntas, respostas, pesos e alertas. IDs estáveis, globalmente únicos; validação de referências, pesos e ciclos antes de iniciar o servidor. A versão pública omite pesos, alertas e faixas.

Cada opção abre as perguntas da sua família. Perguntas comuns aparecem apenas uma vez por pedido, sempre antes das específicas. Famílias compartilham os mesmos IDs das perguntas comuns e reaproveitadas. Uma pergunta tem identidade pelo ID, nunca pelo texto renderizado. Não usar perguntas duplicadas com nomes diferentes.

Ordem comum: segurança agora; com quem aconteceu; se está acontecendo agora; frequência. Nenhuma resposta de aprofundamento é obrigatória. É possível seguir direto ao relato. Contagem acompanha o percurso atual, sem fingir um total fixo quando surgem bifurcações.

Famílias mínimas, baseadas na prévia aprovada:

- Social: ambiente; impacto na rotina.
- Discriminação: motivo (cor/raça/origem, religião, deficiência, orientação sexual/gênero, outro, não sei); ambiente.
- Ameaça: menção a arma/objeto; quando ou onde a ameaça poderia ocorrer.
- Pressão: o que exigem (dinheiro/pertences, intimidade, fazer algo, silêncio, prefiro não responder). Dinheiro abre perda financeira; intimidade abre contato atual e pessoa adulta.
- Sexual: possibilidade de contato atual; se a pessoa é adulta. Sem pedir descrição gráfica nem imagem íntima.
- Intimidade: circulação do conteúdo; exigências. Reaproveita as bifurcações de pressão.
- Violência: necessidade de atendimento agora; arma/objeto.
- Digital: acesso atual à conta/dispositivo; circulação do conteúdo.
- Golpe: envio de dinheiro, dados, ambos, nenhum ou prefiro não responder.
- Pertences: uso de ameaça ou força.
- Patrimônio: dano coloca alguém em risco agora.
- Coletivo: quando/onde; necessidade de atendimento agora.
- Substâncias: alguém está passando mal ou sendo forçado.
- Cuidado: pessoa de confiança disponível hoje.

Toda resposta tem peso explícito, inclusive zero. Alternativas neutras, não sei e prefiro não responder não reduzem a prioridade. Perguntas fora do percurso não são aceitas no envio. Remover uma opção ou mudar um gatilho recalcula a visibilidade até estabilizar e apaga respostas que ficaram inacessíveis, inclusive dependências em cadeia. Voltar preserva respostas ainda válidas.

O questionário continua disponível em arquivo local editável, com validação no carregamento. Capturar uma única definição por envio para validar, pontuar e montar o registro; não reler entre essas operações.

## Triagem proposta, a revisar antes do uso real

Não somar indiscriminadamente todas as opções: o peso-base é o maior das opções selecionadas, com motivo legível. Se não houver opções, base 1.

Somar o maior peso de resposta em cada dimensão, evitando que selecionar muitas opções ou abrir perguntas parecidas aumente artificialmente a prioridade. Cinco dimensões: quando, frequência, alcance, consequências e risco. Cada resposta pontua uma dimensão. Tetos de cada dimensão decorrem do maior peso permitido nela.

Pesos iniciais de respostas:

| Sinal | Dimensão | Peso |
| --- | --- | ---: |
| Acontece agora / voltou a acontecer | quando | 2 |
| Mais de uma vez / quase todos os dias | frequência | 1 / 2 |
| Ambiente, identidade de envolvidos e motivo de discriminação | alcance | 0 |
| Circulação confirmada de conteúdo | alcance | 1 |
| Impacto na rotina / perda de acesso / envio de dinheiro ou dados | consequências | 2 |
| Não está seguro / não tem certeza | risco | 3 / 1 |
| Arma/objeto / ameaça para hoje / necessidade de atendimento | risco | 3 |
| Contato atual em situação sexual / intimidação para levar pertences | risco | 2 |
| Passando mal / participação forçada / dano com risco atual | risco | 3 |
| Sem pessoa de confiança disponível | risco | 1 |
| Demais alternativas, incluindo não sei e prefiro não responder | dimensão da pergunta | 0 |

Faixas estruturadas propostas: baixa abaixo de 5; média de 5 a 8; alta a partir de 9. Crítica decorre de alerta explícito, não só da soma.

Alertas críticos iniciais: não estar em segurança; precisar de atendimento agora; ameaça com arma para hoje; ameaça de ataque à escola ocorrendo agora; suspeita de adulteração com pessoa passando mal; contato sexual sem consentimento com possibilidade atual de aproximação; extorsão envolvendo divulgação íntima. As combinações usam IDs de resposta/opção. Uma opção isolada sobre acontecimento passado não transforma automaticamente todo caso em emergência atual. Alertas são independentes da pontuação e explicados à equipe.

Para relatos sem respostas estruturadas, manter a triagem textual existente. Para pedidos estruturados v3, manter alertas textuais críticos existentes como complemento; não somar novamente pesos de tipo, sinal de andamento e palavras-chave aos sinais já estruturados. O texto pode elevar por alerta, nunca reduzir a prioridade. Preservar o comportamento dos clientes v2.

Guardar pontuação, motivos, prioridade original e um retrato das opções/perguntas/respostas e regras utilizadas na criação. Alterar rótulos ou pesos do arquivo não muda retroativamente casos antigos nem o motivo de sua classificação. O aluno não recebe prioridade, pesos, notas internas ou nomes da equipe.

## Portal do aluno

Fluxo de quatro etapas: situação; entender melhor; relato; revisão e provas. Identificação anônima por padrão. Seleção múltipla entre grupos, com quantidade por grupo e resumo das escolhas. Rótulos acolhedores, sem imagens decorativas necessárias para usar o produto.

Rascunho com IDs v3 e prazo de 24 horas desde a última edição. Guardar somente dados do formulário; nunca guardar código, conversa ou imagens. Rascunhos antigos são descartados com aviso simples. Campos identificados são apagados ao escolher anonimato. Preservar limites de relato e imagem existentes e rotação local.

Revisão mostra assuntos, relato, respostas e identificação, permite voltar para editar. Consentimento explica retenção local, acesso da equipe e limites do anonimato na rede escolar, sem prometer anonimato total. Orientação presencial de risco visível imediatamente e na confirmação. Não exigir questionário para enviar pedido de ajuda.

Falha ou demora da definição oferece relato livre. Se o servidor recusar respostas por alteração da definição, pedir confirmação para enviar sem elas, com texto claro; não rebaixar silenciosamente o conteúdo estruturado. Evitar reenvio duplicado quando só a resposta de rede se perder: gerar identificador de envio aleatório em memória, reaproveitado nas tentativas do mesmo envio e descartado ao começar outro pedido. Deduplicação no servidor transacional e limitada a esse envio, sem usar IP ou identificação pessoal.

Após o envio, código mostrado na confirmação e usado somente no corpo de POST. Conversa, etapas, resolução, melhorou e voltou a acontecer. Mostrar conexão interrompida e reconexão; preservar mensagem digitada e oferecer atualização manual.

Deduplicação: o identificador de envio tem pelo menos 128 bits aleatórios. Derivar o código v3 com HMAC e separação de domínio a partir desse identificador e de um contador de colisão, mantendo o formato legível existente. Guardar apenas o HMAC do identificador, o contador e o resumo canônico do conteúdo, junto ao caso na mesma transação; não guardar o código em claro. Com o identificador original, a repetição pode reconstruir a confirmação após perda de resposta. Conteúdo divergente para o mesmo identificador retorna conflito; comparar também o conteúdo dos anexos e não somente seus nomes. Repetição não deixa novos arquivos órfãos. Os códigos aleatórios v2 continuam válidos. O implementador define a codificação sem viés da saída HMAC e a representação canônica, com testes de colisão forçada, concorrência e restart.

## Coordenação e colaboração em tempo real

Manter visão geral, fila, detalhe, conversa, notas, histórico, resolução, recorrência, usuários e ensaio. Atualizar filtros e respostas para novos grupos e seleção múltipla. Casos antigos continuam consultáveis; não tentar reinterpretar seus relatos.

Responsabilidade compartilhada. Mostrar presença no detalhe: vendo o caso ou escrevendo resposta/nota. Não criar responsável único nem reserva que bloqueia outro colega. Mostrar nomes apenas para usuários autenticados da equipe. Não transmitir o conteúdo dos rascunhos, só o estado de atividade.

Presença em memória, por sessão de aba aleatória: pulso a cada 10 segundos, expiração em 45 segundos, consolidada por usuário na exibição. Ao ocultar/sair, parar pulso e remover quando possível; a expiração cobre perda de rede. Não registrar presença no histórico nem em banco.

Usar fluxo de eventos HTTP com SSE no servidor gevent, em memória, sem Redis. Coordenação abre GET autenticado; aluno abre POST com código no corpo e lê a resposta em streaming. Eventos são invalidações mínimas: a tela busca novamente os dados autorizados; nunca emitir relato, mensagem, código ou nota no evento. Aluno recebe apenas eventos do seu caso. Não manter conexão SQLite aberta durante o streaming.

Publicar somente após commit bem-sucedido. Heartbeat de transporte a cada 15 segundos; nesse intervalo revalidar sessão e usuário da coordenação, fechando sessão expirada/desativada. Reconexão sempre faz leitura completa, inclusive após reinício; não depender de histórico de eventos persistente. Limitar filas de assinantes, fundir invalidações e limpar assinantes desconectados.

Fallback para consulta periódica a cada 8 segundos quando o streaming estiver indisponível; reduzir tentativas de reconexão progressivamente. Aba oculta pausa atualização; retomar faz leitura completa. Uma conexão de evento por portal/aba. Em uma LAN funcional, alvo verificável: alteração aparecer em até dois segundos depois do commit com streaming conectado; não prometer esse prazo durante falhas de rede ou fallback.

Concorrência: coluna de revisão de estado no caso; alterações de status, prioridade, resolução e revisão de recorrência exigem revisão esperada nos novos clientes. Escrita usa compare-and-update na mesma transação. Revisão também avança com mudança de recorrência informada pelo aluno. Conflito retorna 409, carrega estado novo e preserva texto digitado; usuário confirma novamente. Mensagens e notas são append-only e podem coexistir, sem bloquear por revisão. Abertura/presença não alteram revisão.

Clientes v2 mantêm as rotas existentes durante a transição; os novos endpoints/contratos exigem a revisão. A resolução antiga continua impedindo resolução dupla. Eventos registram autoria das ações; presença efêmera não substitui histórico.

## Operação somente LAN e CLI

Instalador padrão novo é LAN. Produzir um pacote LAN e documentação correspondente; não acrescentar configuração de túnel. Bibliotecas e fontes empacotadas, uso do produto sem internet. Instalação nova escuta 0.0.0.0 em portas distintas e libera firewall somente para redes Privada/Domínio, como a variante LAN existente. Atualização mantém portas e dados, e atualiza hosts locais pelo helper existente.

Não mudar a rede/firewall desta máquina de desenvolvimento nem instalar o programa durante implementação. Gerar o pacote para revisão. Permanecem conta inicial criada apenas no próprio servidor, papéis, backups, logs sem endereço de aluno, ACL e recuperação local de senha.

Backup inclui também as cópias personalizadas de questionário e termos de risco quando existirem no diretório de dados. Sem elas uma restauração poderia perder as regras locais, mesmo preservando os retratos históricos já gravados nos casos.

CLI proposta:

```
SegurancaIntegral.exe --status
SegurancaIntegral.exe --status --watch
SegurancaIntegral.exe --data-dir PASTA --status --json
```

Status é somente leitura e não chama inicialização do banco, geração de chaves, criação de contas, backup ou subida do servidor. `--watch` atualiza a cada dois segundos; Ctrl+C encerra apenas o monitor. `--json` é leitura única e não combina com `--watch`. Modos de recuperação de senha/admin são incompatíveis com status. Estado disponível mesmo sem servidor: offline, porta ocupada por outro serviço, configuração inválida ou degradado devem ser diferenciados quando a evidência permitir; estado desconhecido nunca é tratado como saudável.

Checar ambos os portais, identidade/versão do servidor e informações diagnósticas locais. Endpoint de diagnóstico aceita somente loopback direto, sem cabeçalhos de proxy, e não expõe relatos, nomes de usuários, códigos nem chaves. Timeout curto por porta. Mostrar endereços LAN configurados, saúde do banco, uptime e resultado/data do último backup realmente observado. Backup ainda não executado aparece como pendente; arquivo antigo sozinho não prova sucesso atual. Monitor observa, não reinicia serviços automaticamente.

Saídas da CLI: 0 saudável; 1 offline/degradado; 2 uso inválido; 4 configuração ilegível/inválida. No modo watch, retornar o último estado ao encerrar normalmente. A leitura de configuração para status não exige leitura de chaves. Processo servidor continua um único processo gevent com dois portais.

## Persistência, migração e compatibilidade

Backup antes de alterar esquema de banco já existente; migração idempotente, preservar casos, anexos, contas e códigos. Novos campos mínimos: dados estruturados v3 e retrato de triagem, revisão de estado e recibo de deduplicação de envio. Usar transações; presença e eventos ficam somente na memória.

V3 aceita múltiplas opções/grupos. Manter coluna `tipo` legado para leitura de casos antigos e compatibilidade, usando uma projeção determinística da opção de maior peso; desempate pela ordem canônica. Filtros v3 usam IDs estruturados e também incluem os legados mapeados, sem alterar a classificação já gravada. Contrato de envio v3 é discriminado explicitamente e não passa pelo validador v2 por acidente.

## Fora desta entrega

Integrações com polícia/serviços externos, envio de notificações para terceiros, identificação jurídica automática, upload de vídeos/áudio, contatos telefônicos inventados, atuação automática em emergências, responsável único por caso, reconfiguração do roteador e implantação no servidor escolar. Anexos da coordenação na resolução e denúncias administrativas de avaliação/documentação ficam para etapa posterior.

## Critérios de aceitação e verificação

1. Selecionar situações de grupos distintos não repete pergunta nem soma duas vezes o mesmo sinal. Trocar resposta remove descendentes ocultos. Relato livre e falha da definição continuam aceitos.
2. Testes reais de pesos, limites, alertas, descrição histórica e validação de alcance, inclusive payload adulterado. Mostrar motivos legíveis e prioridade original preservada.
3. Teste de migração com banco v2 e restauração de cópia; rascunho v3; envio repetido com mesmo recibo cria um único caso e permite recuperar a confirmação.
4. Duas sessões da coordenação e uma do aluno: mensagem, mudança de status, recorrência, presença, conflito, expiração, reinício e reconexão. Nenhum dado de outro caso ou nota chega ao aluno.
5. CLI offline e online, uma porta indisponível, timeout, configuração inválida, banco indisponível, backup pendente/falho e Ctrl+C sem derrubar servidor. Diagnóstico remoto negado.
6. Verificar teclado, foco, leitura de mensagens, contraste, temas e ausência de overflow em 375, 768 e 1280 px, usando navegador real.
7. Suítes de backend/frontend, TypeScript, contraste, dois builds e empacotamento LAN. Não afirmar teste de instalação em máquina limpa se ele não tiver sido executado.

## Entrega

As fases de contrato/migração e questionário, aluno, colaboração/coordenação e operação LAN/CLI foram implementadas e verificadas. O pacote está em `dist/SegurancaIntegral-Setup-LAN.exe`; instalação em máquina limpa e acesso a partir de outro dispositivo da LAN permanecem fora da validação local registrada.
