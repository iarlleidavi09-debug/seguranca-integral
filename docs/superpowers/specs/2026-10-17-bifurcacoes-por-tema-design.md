# Bifurcações próprias por assunto

## Pedido e diagnóstico

Em 17/10/2026 o usuário pediu expandir as bifurcações, com caminhos próprios para cada tema, e apontou que cyberbullying não tem desdobramentos próprios. O catálogo atual tem oito grupos, 29 opções e vinte perguntas, em sua maioria compartilhadas. Exemplos inadequados: dados divulgados e perfil falso perguntam por controle de conta; adulteração de comida/bebida pergunta quando/onde uma pessoa ameaçou agir. A implementação foi solicitada diretamente; preservar os recursos de mapa e formulários já entregues.

## Resultado esperado

- Cada uma das 29 opções ganha perguntas próprias e pelo menos um desdobramento condicional; não basta repetir uma pergunta genérica com novo ID. Manter compartilhadas somente perguntas que realmente servem a todos ou ao conjunto específico selecionado.
- Cyberbullying tem caminhos para mensagens/ofensas, boatos, imagens/montagens, exclusão de grupos e ameaças. Perguntar contexto/canal e aprofundar somente o conteúdo selecionado, sem pedir descrição gráfica ou reprodução de ofensas/imagens íntimas. Não perguntar por acesso a conta se não houve invasão ou perda de controle.
- Os outros assuntos seguem fatos próprios: perseguição/contato insistente; exigências na chantagem/extorsão; segurança e aproximação em contato sexual; socorro na agressão; acessos na invasão de conta; identidade representada em perfil falso; pagamento/link/dados em golpe; pertences e força; dano e risco no patrimônio; arma/ameaça de ataque; oferta/pressão de substâncias; consumo/sintomas na suspeita de adulteração; segurança/apoio no contexto doméstico; conduta do adulto e ajuda já solicitada; recrutamento e possibilidade de recusar/sair.
- Perguntas gerais existentes de segurança, pessoa afetada, quando e frequência permanecem, uma única vez. Todas as respostas do questionário continuam opcionais, com opção de não saber/não responder quando aplicável. O relato livre continua disponível a qualquer momento. Ano/sala do relator não mudam.
- Linguagem respeitosa e compreensível; preferir pessoa afetada/quem sofreu quando a pergunta também é feita a testemunhas. Não exigir nome/identificação do autor nesse fluxo.
- Pesos e prioridades existentes não devem ser recalibrados como efeito da expansão: dados novos descritivos começam com peso zero. Manter perguntas e alertas existentes quando pertinentes, sem duplicar pontos por dimensão. Novos alertas exigem equivalência factual explícita a um risco já coberto e teste de cenário completo; nenhum alerta só por selecionar um tema.
- Casos antigos preservam snapshots e códigos; não reclassificar respostas históricas. Definições personalizadas sem novos campos continuam aceitas.

## Contrato de alcance

`Pergunta` mantém campos atuais e recebe opcionais:

- `para_opcoes: string[]`: escopo de opções selecionadas. Se presente, pelo menos uma delas precisa estar marcada, tanto para raízes quanto para descendentes. IDs existentes, lista não vazia/sem repetição.
- `mostrar_se_todas: string[]`: AND entre respostas alcançadas e válidas. Quando também existir `mostrar_se` (OR), ambos os critérios precisam ser atendidos.
- `mostrar_se` continua OR. Perguntas referenciadas diretamente em `opcao.perguntas` continuam raízes, preservando a semântica anterior; não listar perguntas condicionais como raízes no novo conteúdo. O escopo `para_opcoes` sempre vale.

Somente respostas pertencentes a perguntas alcançadas podem abrir novos ramos. Ao trocar uma resposta ou desmarcar um tema, limpar descendentes ocultos transitivamente. O backend recusa payload com pergunta fora do caminho. Validador detecta IDs inexistentes, ciclos incluindo AND e escopos malformados; API pública expõe apenas estrutura/textos/condições, sem pesos/alertas.

Limites: até 200 perguntas, definição até 256 KiB, JSON de respostas até 65536 bytes e até 400 IDs totais. Rascunho precisa preservar respostas válidas até esse limite; nunca guardar códigos/imagens/conversa. Condições são dados declarativos, não scripts.

## Validação

Matriz das 29 opções e respostas de abertura/fechamento, destaque para cyberbullying. Seleção múltipla não repete comuns nem abre ramos de assuntos desmarcados. Alternativas de testemunha e relato livre funcionam. Testes de paridade Python/TypeScript, payload adulterado, limpeza transitiva, pesos existentes e snapshots. Ensaiar cyberbullying real no navegador com ramos diferentes, troca de resposta e envio; compilar dois portais e verificar contraste/CSP.
