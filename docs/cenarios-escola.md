# Cenários de teste na escola

Roteiro para o teste do Segurança Integral antes do uso real. Cada linha da
tabela é um cenário: faça os passos, compare com o resultado esperado e anote
o que aconteceu na coluna **Resultado** (em branco de propósito). Quem testa
assina e data no fim.

Endereços usados abaixo: `ALUNO` é o endereço público do portal do aluno e
`COORD` é o da coordenação (os dois criados no túnel, veja o LEIA-ME).

## Antes de começar

- [ ] `http://127.0.0.1:3000/api/saude` e `http://127.0.0.1:4000/api/saude`
      respondem no servidor.
- [ ] Existe o usuário `coordenacao` e a senha foi anotada (se a instalação foi
      silenciosa, rode `SegurancaIntegral.exe --data-dir "C:\ProgramData\SegurancaIntegral" --criar-admin`).
- [ ] A fila da coordenação está vazia ou só tem dados do Modo de ensaio.
- [ ] Há um celular com 4G (fora do Wi-Fi da escola), um segundo celular ou
      computador e uma pessoa da coordenação logada.
- [ ] Há uma imagem pequena (PNG ou JPG), uma imagem maior que 5 MB e um
      arquivo que não é imagem renomeado para `.jpg` (por exemplo um `.txt`).
- [ ] O StarDust está funcionando como antes (o teste não deve afetá-lo).
- [ ] Hoje existe um backup em `C:\ProgramData\SegurancaIntegral\backups\`.

## Tabela de cenários

| # | Cenário | Passos | Resultado esperado | Resultado |
| --- | --- | --- | --- | --- |
| 1 | Aluno anônimo | 1. No celular, abra `ALUNO`. 2. Escolha um tipo, escreva um relato de 2 ou 3 frases e deixe "anônimo" marcado. 3. Envie. 4. Anote o código `XXXX-XXXX` exibido. | Tela de confirmação com o código. Na coordenação, o caso aparece sem nome nem turma. | |
| 2 | Aluno identificado | 1. Abra `ALUNO`. 2. Desmarque "anônimo", preencha nome e turma, escreva o relato. 3. Envie e anote o código. | Código exibido. A coordenação vê nome e turma no caso. | |
| 3 | Caso urgente | 1. Escolha o tipo **Ameaça**, escreva um relato como "vão me bater na saída hoje, um deles está com uma faca" e marque "está acontecendo agora". 2. Envie e abra a fila da coordenação. | O caso entra com gravidade alta e fica acima dos casos de gravidade média e baixa, com os motivos do alerta (tipo, "ocorrendo agora" e termos de risco) no detalhe. Se o tipo escolhido for "Outro" e "agora" não estiver marcado, a gravidade pode sair média ou baixa: a triagem é por regras e a coordenação pode corrigir a gravidade. | |
| 4 | Anexo grande e anexo falso | 1. Envie uma denúncia com a imagem maior que 5 MB. 2. Envie outra com o `.txt` renomeado para `.jpg`. 3. Envie uma terceira com a imagem pequena válida. | A imagem grande e o arquivo falso são recusados com mensagem clara; a denúncia não se perde e o aluno recebe o código. Só a imagem válida aparece no detalhe do caso, abrindo normalmente. | |
| 5 | Celular com rede ruim | 1. No celular, ligue o modo avião por 5 segundos e volte, ou use 3G/área de sinal fraco. 2. Escreva a denúncia e tente enviar. 3. Se falhar, recupere o sinal e envie de novo. | Mensagem de erro compreensível e relato mantido na tela (rascunho). Nada de tela em branco. Atenção: se o envio chegou ao servidor mas a resposta se perdeu, reenviar cria um segundo caso (não há trava contra duplicidade); a coordenação deve estar atenta a casos repetidos. Anote se isso ocorreu. | |
| 6 | Vários alunos ao mesmo tempo | 1. Peça a 10 ou mais alunos que enviem uma denúncia de teste ao mesmo tempo (pelo Wi-Fi da escola). 2. Confira a fila. | Todos os envios são aceitos (100%), sem "muitos envios" (429), sem erro e sem caso trocado. Por padrão o envio de denúncias não tem limite; se alguém religou o limite de `denuncias` no `config.json` (seção 9 do LEIA-ME), lembre que atrás do Wi-Fi da escola todos os alunos saem pelo MESMO endereço público e o limite vale para a escola inteira. Para carga maior use o script da seção abaixo. | |
| 7 | Coordenação respondendo | 1. Entre em `COORD` (Cloudflare Access e depois o login). 2. Abra um caso, mude o status para "em análise", escreva uma nota interna e envie uma mensagem ao aluno. 3. No celular, abra "Acompanhar" e digite o código do cenário 1. | A mensagem aparece para o aluno e a nota interna NÃO aparece. A linha do tempo do caso registra a mudança de status, a nota e a mensagem. O aluno responde e a resposta aparece para a coordenação. | |
| 8 | Código perdido | 1. Em "Acompanhar", digite um código errado, por exemplo `AAAA-AAAA`. 2. Tente 3 vezes seguidas. 3. Tente com o código certo, com letras minúsculas e sem o hífen. | O código errado dá "código não encontrado", igual para qualquer código inexistente, e não bloqueia nada. O limite de consultas é de 600 a cada 10 minutos por endereço de origem: como no Wi-Fi da escola todos saem pelo mesmo endereço, só uma enxurrada de 600 consultas (de um ou de vários aparelhos) faz aparecer "muitas consultas" e trava as consultas da escola inteira por até 10 minutos; quem usa 4G não é afetado. Não é preciso testar o bloqueio aqui. O código certo funciona em minúsculas e sem hífen. Não existe forma de recuperar um código perdido: a coordenação orienta o aluno a fazer uma nova denúncia citando a anterior. | |
| 9 | Bloqueio de login | 1. Em `COORD`, erre a senha 5 vezes. 2. Tente a senha certa. 3. Rode `SegurancaIntegral.exe --redefinir-senha` no servidor (Prompt como Administrador) e entre com a nova senha. | Após 5 falhas a conta bloqueia por 15 minutos e nem a senha certa entra. A mensagem é a mesma de senha errada. `--redefinir-senha` desbloqueia e mostra a nova senha uma vez. | |
| 10 | Reinício da máquina | 1. Reinicie o Windows do servidor. 2. Sem abrir nenhum programa, aguarde 2 minutos. 3. Abra as duas páginas de saúde e o portal do aluno pelo celular. 4. Confira que os casos de antes continuam e que o código do cenário 1 ainda acompanha o caso. | Os dois portais voltam sozinhos (tarefa agendada). Os casos, os anexos e os códigos continuam. Em `backups\` há o backup de hoje. | |

## Teste de carga (script)

O script `scripts/carga.py` envia denúncias variadas (anônimas e identificadas,
com e sem PNG, tipos em rodízio) e mostra quantas foram aceitas, as falhas, o
tempo mediano e o p95. Usa só o Python padrão, então roda em qualquer máquina
com Python 3.

```
python scripts/carga.py --alvo http://127.0.0.1:3000 --total 60 --concorrencia 6
```

- Por padrão o servidor não limita o envio de denúncias, então todos os
  envios devem ser aceitos: qualquer 429 conta como falha e o script devolve
  código de saída 1 (assim como em erro de rede, resposta diferente de 201 ou
  resposta sem código).
- Se o limite de envio foi religado no `config.json` (seção 9 do LEIA-ME,
  `"limites": {"denuncias": [N, 600]}`), rode com `--limite-esperado`: os 429
  passam a contar à parte, sem ser falha. `--sem-limite-esperado` continua
  aceito e equivale ao padrão.
- Os casos criados ficam no banco. Rode contra uma pasta de dados de ensaio
  (`--data-dir` diferente) ou apague os casos de teste pelo Modo de ensaio
  quando forem simulados; casos reais não se apagam.
- Meta de referência: nenhuma falha, mediana abaixo de 1 segundo e o
  processo do servidor abaixo de 250 MB de memória.

## Modo de ensaio (dados simulados)

O menu **Ensaio** da coordenação serve para treinar a equipe sem usar dados
reais.

1. Entre em `COORD` e abra o menu **Ensaio**.
2. **Carregar casos de simulação**: cria casos de exemplo marcados como
   simulados (todos os tipos e gravidades, com mensagens e notas).
3. Treine a fila, os filtros, as respostas e as notas nesses casos.
4. **Remover simulação** (pede confirmação): apaga só o que foi marcado como simulado.
   Faça isso antes do uso real. Casos de verdade nunca são removidos por ali.

Confira no fim que a fila não tem mais casos marcados como simulados.

## Fechamento do teste

| Item | Resposta |
| --- | --- |
| Data do teste | |
| Quem testou | |
| Cenários que falharam (números) | |
| Problemas a corrigir antes do uso real | |
| Limites do `config.json` voltaram ao padrão? | |
| Casos simulados e de teste removidos? | |
| Assinatura | |
