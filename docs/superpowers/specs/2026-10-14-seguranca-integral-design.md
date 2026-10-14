# Segurança Integral: design da v1

Data: 2026-10-14
Estado: aguardando revisão do usuário

## 1. Objetivo e contexto

Protótipo usável de um sistema contra cyberbullying e outros crimes digitais
em escolas. Dois públicos:

- **Aluno ou vítima:** canal próprio para pedir ajuda, de forma anônima ou
  identificada, e acompanhar o caso.
- **Escola (coordenação):** painel para triar, revisar e acompanhar os casos.

O protótipo será usado em testes dentro de uma escola, com autorização da
direção, simulando vários cenários e fatores. Não é um produto final.

### Decisões já tomadas

| Tema | Decisão |
| --- | --- |
| Entrada de dados | Denúncia ativa do aluno (detecção automática e importação de provas ficam para depois) |
| IA | Fora da v1. Triagem por regras, com interface pronta para plugar IA depois |
| Formato | Aplicação web responsiva, duas áreas (aluno e coordenação) |
| Pilha | Python (Flask + gevent), React, SQLite, mesmo estilo do projeto StarDust |
| Hospedagem | Servidor Windows de produção do usuário (8 GB de RAM, sem GPU), que já hospeda o StarDust |
| Acesso | Pela internet, via Cloudflare Tunnel já existente, com subdomínios novos |
| Coordenação | Login e senha obrigatórios |
| Pacote | `.exe` único mais instalador Windows (Inno Setup) |
| Escopo da v1 | Denúncia, triagem por regras, painel da coordenação, acompanhamento do caso |

### Fora da v1

IA de classificação, detecção automática em texto colado, relatório PDF de
evidências, notificações por e-mail ou WhatsApp, várias escolas.

### Premissas a confirmar

- O servidor de produção é uma máquina diferente deste PC de desenvolvimento.
  Os dados exatos (processador, disco) não foram informados. O design assume
  8 GB de RAM compartilhados com o StarDust.
- A LGPD foi tratada como fora de escopo pelo usuário, com autorização da
  direção da escola. A spec mantém um mínimo de proteção (seção 7).

## 2. Arquitetura

```text
Aluno (celular)  --HTTPS--> Cloudflare --túnel--> 127.0.0.1:3000 ┐
                                                                  ├─ Programa Flask (gevent) ── SQLite
Coordenação (PC) --HTTPS--> Cloudflare --túnel--> 127.0.0.1:4000 ┘
```

- Um único processo sobe dois ouvintes em `127.0.0.1`: porta 3000 (portal do
  aluno) e porta 4000 (portal da coordenação). Mesmo banco para os dois.
- As rotas da coordenação existem só na porta 4000 e exigem login. A porta 3000
  não registra nenhuma rota de revisão.
- Banco SQLite em `C:\ProgramData\SegurancaIntegral`, separado do StarDust.
  Anexos em pasta ao lado, com limite de tamanho e tipo.
- Dois sites React (um por portal), compilados e embutidos no programa.
- A fila da coordenação atualiza por consulta periódica (polling a cada poucos
  segundos), sem Socket.IO, para poupar recursos.
- Túnel: o instalador não altera o `cloudflared` nem o StarDust. Ele imprime as
  rotas a criar no painel Cloudflare: `escola.<dominio>` para `127.0.0.1:3000`
  e `coordenacao.<dominio>` para `127.0.0.1:4000`. Não usar UPnP nem
  encaminhamento de porta em conjunto com o túnel.
- Triagem atrás de uma interface `classificar(caso) -> (gravidade, motivos)`.
  A v1 usa regras; uma IA futura implementa a mesma interface.

### Empacotamento

- PyInstaller gera o executável. Inno Setup gera o instalador.
- O instalador cria as pastas, gera a chave e o primeiro usuário da
  coordenação (senha mostrada uma vez), registra a tarefa de inicialização e
  mostra as instruções de rota do túnel.
- Backup automático diário do banco e dos anexos, retenção de 7 dias.
- Limite de recursos pensado para 8 GB: sem serviços pesados, sem Docker.

## 3. Portal do aluno (porta 3000, foco em celular)

1. **Tela inicial:** botão "Preciso de ajuda" e campo "Acompanhar meu caso".
   Aviso de consentimento visível, explicando o que é guardado.
2. **Denúncia em 3 passos:**
   - Tipo: cyberbullying, ameaça, vazamento de fotos ou dados, golpe ou
     extorsão, perfil falso, aliciamento, outro.
   - Relato: descrição livre, quando, onde (rede social ou app) e se está
     acontecendo agora.
   - Provas e identificação: até 5 imagens de até 5 MB cada; escolha entre
     anônimo ou identificado (nome e turma).
3. **Confirmação:** código de acompanhamento de 8 caracteres (ex.: `K7M2-9QXD`),
   mostrado uma vez, sem conta e sem e-mail. Mesmo na denúncia identificada o
   acesso do aluno é só pelo código.
4. **Acompanhar:** com o código, o aluno vê status e mensagens da coordenação e
   pode responder.

## 4. Triagem por regras

Pontuação simples e explicável, calculada ao enviar:

- Cada tipo de caso tem peso base (aliciamento e ameaça pesam mais).
- "Está acontecendo agora" e pedido de ajuda urgente somam pontos.
- Lista de termos de risco (ameaça de violência, automutilação, nudes,
  extorsão) soma pontos. A lista fica em arquivo de configuração, editável sem
  recompilar.
- Saída: gravidade baixa, média ou alta mais a lista de motivos
  ("citou ameaça", "ocorrendo agora").
- A coordenação pode alterar a gravidade; a mudança fica registrada.
- Casos de gravidade alta aparecem no topo, destacados.

## 5. Portal da coordenação (porta 4000, foco em desktop)

- Login com usuário e senha. Hash forte, bloqueio temporário após tentativas
  erradas, sessão com expiração.
- Fila ordenada por gravidade e antiguidade, com filtros por status e tipo.
- Caso aberto: relato, provas, motivos da triagem, linha do tempo e mensagens.
- Status: novo, em análise, aguardando aluno, encaminhado (família, direção ou
  órgão externo) e resolvido. Cada mudança registra autor e hora.
- Notas internas, nunca visíveis ao aluno, separadas das mensagens ao aluno.
- Gestão de usuários da coordenação: criar e desativar contas.
- **Modo de ensaio:** carrega 15 a 20 casos fictícios de gravidades variadas,
  marcados como "simulação", removíveis com um clique sem tocar nos casos reais.

## 6. Modelo de dados (resumo)

- `casos`: id, código de acompanhamento (guardado como hash), tipo, relato,
  quando, onde, em_andamento, anonimo, nome e turma (nulos se anônimo),
  gravidade, motivos, status, simulacao, criado_em, atualizado_em.
- `anexos`: id, caso_id, nome interno, tipo real, tamanho.
- `mensagens`: id, caso_id, autor (aluno ou coordenação), texto, criado_em.
- `notas_internas`: id, caso_id, usuario_id, texto, criado_em.
- `eventos`: id, caso_id, tipo, usuario_id, detalhe, criado_em (linha do tempo
  e auditoria de mudanças de status e gravidade).
- `usuarios`: id, nome de usuário, hash da senha, ativo, tentativas, bloqueado_até.

## 7. Segurança e privacidade mínimas

- Denúncia anônima não guarda nome, turma nem endereço IP no banco.
- Código de acompanhamento armazenado só como hash; comparação em tempo
  constante; limite de tentativas por origem.
- Limite de envios por aparelho contra spam.
- Upload: valida tipo real do arquivo (não só extensão), recodifica ou rejeita
  conteúdo inválido, nome interno aleatório, limite de tamanho e quantidade.
  Anexos só são servidos a coordenação autenticada, nunca por caminho previsível.
- Cabeçalhos de segurança (CSP, HSTS atrás do túnel), validação de origem e
  host, sessões com expiração.
- Dados e anexos ficam apenas no servidor do usuário. Nenhum dado é enviado a
  serviços externos na v1.
- Aviso de consentimento visível na tela inicial do aluno.
- Como o acesso é pela internet, o portal da coordenação nunca fica sem login.
  Recomendação de reforço opcional: Cloudflare Access na frente do subdomínio
  da coordenação.

## 8. Tratamento de erros

- Falha no envio: o texto fica salvo como rascunho no aparelho e o aluno vê
  "tente de novo", sem perder o relato.
- Anexo recusado: mensagem clara e a denúncia segue sem ele.
- Banco ocupado ou disco cheio: erro amigável, log, servidor continua de pé.
- Reinício da máquina: o programa sobe sozinho; dados persistem.

## 9. Testes

- **Triagem:** casos em tabela garantindo gravidade e motivos esperados.
- **API:** denúncia anônima e identificada, código de acompanhamento,
  mensagens, status e permissões. Provar que a porta 3000 nunca alcança rotas
  da coordenação e que a porta 4000 sem login retorna 401.
- **Segurança:** bloqueio por tentativas de login, upload falso, acesso a anexo
  de outro caso, enumeração de códigos.
- **Interface:** percurso completo em navegador real em 375, 768 e 1280 px,
  nos temas claro e escuro.
- **Instalador:** instalar em pasta ou VM limpa, subir, abrir as duas portas e
  desinstalar.
- **Carga:** script que envia dezenas de denúncias seguidas para medir o
  desempenho em 8 GB junto com o StarDust.
- **Cenários da escola:** documento com roteiro (aluno anônimo, identificado,
  caso urgente, anexo grande, rede ruim, vários alunos ao mesmo tempo,
  coordenação respondendo).

## 10. Extensão futura (IA)

A interface de triagem permite trocar o classificador por regras por uma
chamada de IA (API na nuvem, ou modelo local se houver hardware). Por ora não
há dependência de IA em nenhuma parte do fluxo.

## 11. Riscos

| Risco | Mitigação |
| --- | --- |
| 8 GB de RAM divididos com o StarDust | Processo único, SQLite, polling, sem Docker, teste de carga |
| Servidor exposto à internet com dados de menores | Login obrigatório, anonimato real, sem dados externos, Cloudflare Access opcional |
| Máquina desligada ou sem internet na hora do teste | Tarefa de inicialização, backup diário, roteiro de verificação antes do teste |
| Conflito com o StarDust (portas, túnel) | Portas e pastas próprias; o instalador não altera `cloudflared` nem o StarDust |
