# TETRAGUARD 3.1.0

Contexto confirmado pelo usuário em 16/10/2026, consolidado da especificação v3 aprovada. Não é uma nova entrevista nem altera o escopo aprovado.

## Contexto atual de hospedagem

Em 16/11/2026 o usuário informou que o sistema não funciona mais em rede local. O contexto atual é um sistema hospedado para uma única escola. Não há suporte informado a várias escolas; não presumir isso.

Provedor, domínio, infraestrutura, backups e mecanismo de e-mail ou notificação não foram informados. Ver "Pontos desconhecidos" abaixo.

## Pontos desconhecidos

- Provedor de hospedagem.
- Domínio de acesso.
- Infraestrutura (servidor, banco, armazenamento de anexos e fotos).
- Backups: frequência, local e restauração.
- E-mail ou outro mecanismo de notificação.

## Uso

Canal escolar de pedidos de ajuda e acompanhamento. Alunos relatam situações vividas ou observadas sem precisar classificá-las juridicamente. A equipe da coordenação acolhe, investiga, conversa, registra providências e acompanha recorrências.

## Superfícies

- Portal do aluno: celular e desktop; situação, perguntas opcionais, relato, provas/revisão, confirmação e conversa pelo código. Na implantação anterior, o acesso era pela rede local da escola.
- Coordenação: visão geral, casos, detalhe, conversa, notas internas, histórico, resolução, pós-resolução, usuários e ensaio.
- Operação: a implantação anterior em rede local usava servidor Windows com dois portais, instalador LAN e monitor CLI somente leitura (histórico em `docs/operacao-lan.md`). A operação atual de hospedagem ainda não está descrita.

## Objetivos confirmados

Categorias colapsáveis com descrições simples, perguntas sem repetição, cada opção e resposta com peso, coordenação trabalhando simultaneamente com atualização automática. O requisito de funcionamento sem serviços externos vinha da implantação em rede local (histórico); a exigência atual de hospedagem está em aberto. Em 16/11/2026, o usuário confirmou a operação hospedada para uma escola e identificou esta pasta como a base principal a atualizar.

## Compromissos

Anônimo por padrão; código somente em POST, sem URL. Conforme pedido de 20/10/2026, os acessos aos casos e o marcador de leitura ficam neste navegador, com opção de apagar; conteúdo das conversas não é salvo nesse histórico. Não prometer anonimato total da rede. Separar conversa visível ao aluno de notas internas e autoria da equipe. Preservar dados e códigos existentes. Prioridade apoia a equipe, não substitui atendimento ou julgamento humano.

## Autoridade de escopo

`docs/superpowers/specs/2026-10-16-v3-lan-colaboracao-design.md` e a aprovação explícita do usuário. Priorizar a prévia aprovada para organização do fluxo. Pesos numéricos são provisórios e constam nessa spec.

## Complemento aprovado em 17/10/2026

Mapa desenhável na coordenação, inicialmente vazio, com alas e ambientes retangulares ou em L, navegação por andares e salas e filtros de casos por localização/turma. Ano e sala obrigatórios são de quem relata, mesmo quando não informa nome. Na finalização, nome, ano e sala dos autores identificados são internos à equipe, com foto opcional; autoria não identificada exige justificativa interna. A planta e a apuração não expõem nomes/fotos no mapa ou no acompanhamento do aluno.

Especificação e plano: `docs/superpowers/specs/2026-10-17-mapa-escolar-design.md` e `docs/superpowers/plans/2026-10-17-mapa-escolar.md`. O usuário aprovou a prévia, pediu a implementação e acrescentou o suporte a alas em L durante a execução.

Cada uma das 29 situações tem perguntas e desdobramentos próprios. Cyberbullying distingue mensagens, boatos, imagens, exclusão e ameaças. Perguntas compartilhadas aparecem somente quando pertinentes; trocar uma resposta remove os caminhos fechados. As perguntas permanecem opcionais, com acesso ao relato livre. Matriz em `docs/bifurcacoes-por-tema.md` e escopo em `docs/superpowers/specs/2026-10-17-bifurcacoes-por-tema-design.md`.
