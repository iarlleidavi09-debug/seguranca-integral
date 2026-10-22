# Bifurcações por assunto

As quatro perguntas comuns aparecem uma única vez. Toda resposta é opcional. As perguntas novas são descritivas, com peso zero; faixas e alertas existentes foram preservados.

Cada linha abaixo registra uma raiz exclusiva ou um desdobramento condicionado. Condições de uma linha são OR, exceto `q-cyber-imagens-circulacao`, que exige as duas respostas (AND). O escopo `para_opcoes` limita cada pergunta ao assunto indicado.

| Assunto | Pergunta | Fato aprofundado | Abertura |
|---|---|---|---|
| cyber | `q-cyber-forma` | O que aconteceu na internet? Não é preciso reproduzir ofensas ou enviar imagens. | Raiz própria |
| cyber | `q-cyber-canal` | Por qual canal isso aconteceu? | Raiz própria |
| cyber | `q-cyber-mensagens` | Como as mensagens ou ofensas chegaram à pessoa afetada? | q-cyber-forma.mensagens |
| cyber | `q-cyber-boatos` | Como os boatos estão sendo espalhados? | q-cyber-forma.boatos |
| cyber | `q-cyber-imagens` | O que fizeram com as imagens, vídeos ou montagens? Sem enviar ou detalhar o conteúdo. | q-cyber-forma.imagens |
| cyber | `q-cyber-imagens-circulacao` | Até onde as imagens ou montagens chegaram? | q-cyber-forma.imagens, q-cyber-imagens.publicadas |
| cyber | `q-cyber-exclusao` | Como a exclusão online afetou a participação? | q-cyber-forma.exclusao |
| cyber | `q-cyber-ameacas` | Que tipo de ameaça foi feita, sem repetir o conteúdo? | q-cyber-forma.ameacas |
| cyber | `q-cyber-alcance` | Quem conseguiu ver as mensagens ou os boatos? | q-cyber-forma.mensagens, q-cyber-forma.boatos |
| bullying | `q-bullying-forma` | Como acontecem as humilhações ou a exclusão? | Raiz própria |
| bullying | `q-bullying-participacao` | Em que situações a exclusão impede a participação? | q-bullying-forma.exclusao |
| discriminacao | `q-discriminacao-tratamento` | Como ocorreu o tratamento desigual? | Raiz própria |
| discriminacao | `q-discriminacao-acesso` | O que foi dificultado ou negado? | q-discriminacao-tratamento.acesso, q-discriminacao-tratamento.regra |
| ameaca | `q-ameaca-meio` | Como a ameaça de machucar chegou à pessoa afetada? | Raiz própria |
| ameaca | `q-ameaca-destino` | A ameaça indicava quem poderia ser atingido? | q-ameaca-meio.direta, q-ameaca-meio.mensagem, q-ameaca-meio.terceiro |
| perseguicao | `q-perseguicao-conduta` | Como acontece a procura insistente? | Raiz própria |
| perseguicao | `q-perseguicao-aproximacao` | Onde a pessoa é seguida ou esperada? | q-perseguicao-conduta.seguir, q-perseguicao-conduta.locais |
| chantagem | `q-chantagem-pressao` | O que usam para pressionar a pessoa? | Raiz própria |
| chantagem | `q-chantagem-segredo` | O que pedem em relação às informações? | q-chantagem-pressao.divulgar |
| extorsao | `q-extorsao-cobranca` | Como estão cobrando dinheiro ou pertences? | Raiz própria |
| extorsao | `q-extorsao-entrega` | A exigência envolve uma entrega combinada? | q-extorsao-cobranca.pagamento, q-extorsao-cobranca.entrega, q-extorsao-cobranca.repetida |
| assedio | `q-assedio-conduta` | Que tipo de aproximação sexual indesejada aconteceu? | Raiz própria |
| assedio | `q-assedio-convites` | Como os convites indesejados estão sendo feitos? | q-assedio-conduta.convites |
| contato | `q-contato-situacao` | Em que contexto ocorreu o contato sem consentimento? Sem detalhes do toque. | Raiz própria |
| contato | `q-contato-saida` | O que dificultou se afastar do contato? | q-contato-situacao.impedido |
| aliciamento | `q-aliciamento-pedido` | Que tipo de pedido chamou atenção? | Raiz própria |
| aliciamento | `q-aliciamento-encontro` | Como seria o encontro pedido? | q-aliciamento-pedido.encontro |
| intimidade | `q-intimidade-exposicao` | O que aconteceu com o conteúdo íntimo? Sem enviar ou detalhar imagens. | Raiz própria |
| intimidade | `q-intimidade-destino` | Onde o conteúdo íntimo foi compartilhado? | q-intimidade-exposicao.envio |
| exploracao | `q-exploracao-troca` | O que foi oferecido ou usado como pressão envolvendo algo sexual? | Raiz própria |
| exploracao | `q-exploracao-dependencia` | A pessoa depende dessa oferta para uma necessidade? | q-exploracao-troca.necessidade |
| agressao | `q-agressao-situacao` | Como a agressão ocorreu, sem detalhes dos ferimentos? | Raiz própria |
| agressao | `q-agressao-continua` | O confronto ainda mantém pessoas próximas umas das outras? | q-agressao-situacao.confronto, q-agressao-situacao.surpresa, q-agressao-situacao.grupo |
| violencia | `q-violencia-restricao` | O que impediu a pessoa de sair ou se proteger? | Raiz própria |
| violencia | `q-violencia-liberdade` | A pessoa já conseguiu sair dessa situação? | q-violencia-restricao.trancada, q-violencia-restricao.contida, q-violencia-restricao.ameacada |
| ataque | `q-ataque-informacao` | Como você soube da tentativa de matar ou da morte? | Raiz própria |
| ataque | `q-ataque-atendimento` | Pelo que você sabe, o atendimento foi acionado? | q-ataque-informacao.presenciei, q-ataque-informacao.pessoa, q-ataque-informacao.mensagem |
| dados | `q-dados-material` | Que tipo de informação particular foi divulgado? Sem informar os dados aqui. | Raiz própria |
| dados | `q-dados-localizacao` | Os dados divulgados permitem localizar a pessoa? | q-dados-material.dados |
| conta | `q-conta-sinal` | Que sinal de invasão da conta ou dispositivo foi percebido? | Raiz própria |
| conta | `q-conta-atividade` | Que atividade não reconhecida foi percebida? | q-conta-sinal.atividade |
| perfil | `q-perfil-identidade` | Quem o perfil falso ou a pessoa está tentando representar? | Raiz própria |
| perfil | `q-perfil-uso` | Como essa identidade está sendo usada? | q-perfil-identidade.afetada, q-perfil-identidade.conhecida, q-perfil-identidade.instituicao |
| golpe | `q-golpe-abordagem` | Qual foi a abordagem suspeita? | Raiz própria |
| golpe | `q-golpe-link` | O que aconteceu com o link ou arquivo? | q-golpe-abordagem.link |
| pertences | `q-pertences-objeto` | Que tipo de pertence foi levado? | Raiz própria |
| pertences | `q-pertences-digital` | Além da perda do equipamento, o que foi percebido? | q-pertences-objeto.digital |
| patrimonio | `q-patrimonio-dano` | Que parte do espaço ou equipamento foi danificada? | Raiz própria |
| patrimonio | `q-patrimonio-instalacao` | Qual sinal foi percebido nas instalações? | q-patrimonio-dano.instalacao |
| arma | `q-arma-presenca` | Como a arma ou objeto foi usado para intimidar? | Raiz própria |
| arma | `q-arma-proximidade` | Pelo que você sabe, onde está a pessoa com a arma ou objeto? | q-arma-presenca.visto, q-arma-presenca.mostrado, q-arma-presenca.uso |
| ataque-escola | `q-ataque-escola-sinal` | Como a ameaça de ataque à escola apareceu? | Raiz própria |
| ataque-escola | `q-ataque-escola-objeto` | O que se sabe sobre o local do objeto suspeito? Não toque nem se aproxime para conferir. | q-ataque-escola-sinal.objeto |
| substancias | `q-substancias-situacao` | O que aconteceu envolvendo drogas ou álcool? | Raiz própria |
| substancias | `q-substancias-pressao` | Como foi feita a pressão para consumir? | q-substancias-situacao.pressao |
| adulteracao | `q-adulteracao-consumo` | Alguém consumiu a comida ou bebida suspeita? | Raiz própria |
| adulteracao | `q-adulteracao-sintomas` | O que foi percebido após o consumo, sem detalhes clínicos? | q-adulteracao-consumo.sim |
| casa | `q-casa-cuidado` | Que situação de violência ou falta de cuidado está acontecendo em casa? | Raiz própria |
| casa | `q-casa-necessidade` | Qual cuidado está faltando? | q-casa-cuidado.basico, q-casa-cuidado.abandono |
| adulto | `q-adulto-conduta` | Que conduta do adulto da escola ocorreu? | Raiz própria |
| adulto | `q-adulto-contexto` | Em qual situação aconteceu o constrangimento ou tratamento desigual? | q-adulto-conduta.constrange, q-adulto-conduta.discrimina |
| omissao | `q-omissao-ajuda` | Como a ajuda foi solicitada ao adulto? | Raiz própria |
| omissao | `q-omissao-retorno` | Que resposta houve ao pedido de ajuda? | q-omissao-ajuda.conversa, q-omissao-ajuda.mensagem, q-omissao-ajuda.terceiro |
| recrutamento | `q-recrutamento-atividade` | Que tipo de participação estão exigindo? Sem nomes ou detalhes da atividade. | Raiz própria |
| recrutamento | `q-recrutamento-recusa` | O que acontece se a pessoa tentar recusar ou sair? | q-recrutamento-atividade.transportar, q-recrutamento-atividade.dinheiro, q-recrutamento-atividade.atrair, q-recrutamento-atividade.outra |

## Compartilhadas e correções

Dados divulgados e perfil falso deixam de perguntar sobre controle de conta. Perfil falso aprofunda a identidade representada e seu uso. Invasão conserva acesso à conta; somente mensagens ou publicações não reconhecidas abrem a pergunta compartilhada de circulação. Senha alterada, aviso de acesso ou alteração de perfil sem publicação não pressupõem divulgação. Divulgação íntima e dados conservam alcance do conteúdo como raiz direta; a pergunta compartilhada inclui a resposta “Não”. Adulteração pergunta consumo e, somente após consumo, alterações percebidas; mantém socorro como pergunta de segurança.

Perseguição aprofunda seguir, esperar e contato insistente, sem presumir arma ou ameaça com horário. Cyberbullying só abre as perguntas existentes de arma e momento/local após a pessoa indicar ameaça física. Isso conserva a mesma regra factual do alerta existente, sem gerar alerta apenas pela seleção de cyberbullying. A pergunta de momento/local usa “Houve indicação de quando ou onde alguém seria machucado?” e aceita “Não houve indicação”, inclusive quando uma arma foi vista sem fala ou ameaça verbal.

Perguntas comuns e compartilhadas preservam IDs, pesos e respostas anteriores; foram acrescentadas alternativas de não responder onde faltavam e ajustada a linguagem para quem relata como testemunha. Não há solicitação de nome do autor, envio de mídia ou descrição gráfica.

Catálogo: 29 opções, 8 grupos, 85 perguntas; 95678 bytes UTF-8.
