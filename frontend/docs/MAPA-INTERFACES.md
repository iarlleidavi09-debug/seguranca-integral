# Mapa e índice das interfaces

As definições atuais estão em [docs/DEFINICOES.md](docs/DEFINICOES.md). As tabelas abaixo descrevem a base original; seus status e chamadas de API não substituem as novas regras aprovadas.

Prévias aprovadas: [aluno jovem e expressivo](http://127.0.0.1:5173/aluno-revisao.html) e [coordenação acolhedora](http://127.0.0.1:5173/revisao.html). O índice da base original permanece em [interfaces.html](http://127.0.0.1:5173/interfaces.html).

Mapeamento do frontend copiado, baseado nos componentes e seus gatilhos de navegação. Inclui telas, etapas, abas, janelas e estados condicionais. Nenhuma interface foi alterada.

## Entradas

| Portal | Endereço local | Entrada no código |
| --- | --- | --- |
| Aluno | [Abrir aluno](http://127.0.0.1:5173/) | `index.html` → `src/aluno/main.tsx` → `src/aluno/App.tsx` |
| Coordenação | [Abrir coordenação](http://127.0.0.1:5173/coordenacao.html) | `coordenacao.html` → `src/coord/main.tsx` → `src/coord/App.tsx` |

Os links exigem o servidor local ativo. Nesta cópia há apenas frontend: as transições que exigem resposta da API dependem de um backend compatível.

## Fluxo do aluno

```mermaid
flowchart TD
  A[Início] -->|Preciso de ajuda| B[1. Qual é a situação?]
  B -->|Escolher tipo e Continuar| C[2. O que aconteceu?]
  C -->|Relato válido e Continuar| D[3. Provas e identificação]
  D -->|Quero me identificar| E[Campos de nome e turma]
  E -->|Quero ficar anônimo| D
  D -->|Enviar pedido de ajuda e API aceitar| F[Seu pedido foi recebido]
  E -->|Enviar pedido de ajuda e API aceitar| F
  F -->|Acompanhar meu caso| G[Acompanhamento]
  A -->|Preencher código e Acompanhar| G
  G -->|API encontrar o código| H[Status e conversa com a coordenação]
  C -->|Voltar| B
  D -->|Voltar| C
```

| ID | Interface | Gatilho para chegar | Condição | Componente |
| --- | --- | --- | --- | --- |
| A01 | Início: “Você pode pedir ajuda.” | Abrir o portal ou clicar em **Voltar ao início** | Não exige API | `src/aluno/Inicio.tsx` |
| A02 | Passo 1: “Qual é a situação?” | A01 → **Preciso de ajuda** | Não exige API | `src/aluno/Denuncia.tsx` |
| A03 | Passo 2: “O que aconteceu?” | A02 → escolher um tipo → **Continuar** | Tipo obrigatório | `src/aluno/Denuncia.tsx` |
| A04 | Passo 3: “Provas e identificação” | A03 → preencher relato → **Continuar** | Relato de 10 a 5000 caracteres, após remover espaços nas pontas | `src/aluno/Denuncia.tsx` |
| A04a | Campos “Seu nome” e “Sua turma” | A04 → **Quero me identificar** | Nome passa a ser obrigatório para enviar; turma opcional | `src/aluno/Denuncia.tsx` |
| A04b | Prévias de imagens anexadas | A04 → **Adicionar imagens** → selecionar arquivos | Até 5 imagens; até 5 MB cada; PNG, JPEG, WebP ou GIF | `src/aluno/Denuncia.tsx` |
| A05 | Confirmação: “Seu pedido foi recebido.” | A04 → **Enviar pedido de ajuda** | Validação aprovada e sucesso de `POST /api/denuncias` | `src/aluno/Confirmacao.tsx` |
| A06 | Acompanhamento: consulta/carregamento | A01 → código não vazio → **Acompanhar**, ou A05 → **Acompanhar meu caso** | A entrada dispara consulta à API; o código precisa existir para mostrar o caso | `src/aluno/Acompanhar.tsx` |
| A06a | Status e “Conversa com a coordenação” | A06 → consulta aceita | Sucesso de `POST /api/acompanhar` | `src/aluno/Acompanhar.tsx` |

### Retornos e ações internas do aluno

| Onde | Gatilho | Resultado |
| --- | --- | --- |
| Qualquer tela fora do início | **Voltar ao início** | Volta a A01; desabilitado durante envio do pedido |
| Passos 2 e 3 | **Voltar** | Retrocede uma etapa e mantém os campos |
| Formulário com rascunho | **Limpar rascunho** | Limpa campos textuais/escolhas e retorna ao passo 1; não remove os anexos já selecionados |
| Passo 3 | **Quero ficar anônimo** | Oculta e limpa nome/turma |
| Prévia de anexo | **Remover** | Remove a imagem selecionada |
| Confirmação | **Copiar código** | Copia o código e mostra sucesso ou falha, sem mudar de tela |
| Acompanhamento sem caso | Código → **Acompanhar** | Refaz a consulta |
| Conversa carregada | **Atualizar conversa** | Busca novamente status e mensagens |
| Conversa carregada | Resposta → **Enviar resposta** | Envia texto de 1 a 2000 caracteres e tenta atualizar a conversa |

**Endereços:** todas as telas do aluno usam a mesma página `/`. Não há links diretos para os passos, a confirmação ou um caso. Recarregar reinicia no início. O rascunho textual pode ser restaurado ao abrir novamente o formulário, mas o passo volta a 1; imagens precisam ser adicionadas novamente após sair do formulário.

## Fluxo da coordenação

```mermaid
flowchart TD
  A[Abrir portal] --> B[Verificando a sessão]
  B -->|Sem sessão ou falha| C[Login]
  B -->|Sessão válida| D[Tela indicada pelo endereço]
  C -->|Entrar e sessão confirmada| D
  D --> E[Fila]
  D --> F[Usuários]
  D --> G[Ensaio]
  D --> H[Caso indicado por hash]
  E -->|Clicar na linha de um caso| H
  H -->|Voltar à fila| E
  H -->|Mensagens ao aluno| I[Aba de mensagens]
  H -->|Notas internas| J[Aba de notas]
  H -->|Clicar na miniatura| K[Janela Anexo ampliado]
  F -->|Desativar outro usuário ativo| L[Confirmar desativação]
  G -->|Remover simulação| M[Confirmar remoção]
  D -->|Sair ou API responder 401| C
```

| ID | Interface | Gatilho para chegar | Endereço/condição | Componente |
| --- | --- | --- | --- | --- |
| C00 | “Verificando a sessão.” | Abrir/recarregar a coordenação | Consulta inicial `GET /api/eu` | `src/coord/App.tsx` |
| C01 | Login: “Portal da coordenação” | Verificação sem sessão, falha na verificação, **Sair** ou perda da sessão | Visível em qualquer endereço da coordenação sem sessão | `src/coord/Login.tsx` |
| C01a | Login: “Tentar de novo” | Login aceito, mas leitura da sessão falha | Oculta nome/senha e permite repetir apenas `GET /api/eu` | `src/coord/Login.tsx` |
| C02 | Fila de casos | Login no endereço base, sessão já válida no endereço base, menu **Fila** ou **Voltar à fila** | [Abrir fila](http://127.0.0.1:5173/coordenacao.html); exige sessão e API para dados | `src/coord/Fila.tsx` |
| C03 | Detalhe do caso | C02 → clicar na linha de um caso, ou abrir `#caso-ID` | Exemplo de formato: `/coordenacao.html#caso-123`; exige sessão e caso existente | `src/coord/Caso.tsx` |
| C03a | Aba “Mensagens ao aluno” | Padrão ao abrir C03 ou clicar na aba | Mesmo endereço do caso | `src/coord/Caso.tsx` |
| C03b | Aba “Notas internas” | C03 → **Notas internas** | Mesmo endereço do caso; também alterna por setas, Home e End | `src/coord/Caso.tsx` |
| C03c | Janela “Anexo ampliado” | C03 → clicar na miniatura de um anexo | Exige anexo disponível; não altera URL | `src/coord/Caso.tsx` → `Anexos` |
| C04 | Usuários + formulário “Novo usuário” | Menu **Usuários** ou abrir `#usuarios` | [Abrir usuários](http://127.0.0.1:5173/coordenacao.html#usuarios); exige sessão | `src/coord/Usuarios.tsx` |
| C04a | Confirmação de desativação | C04 → **Desativar** | Só aparece para outro usuário ativo; não permite desativar a própria conta | `src/coord/Usuarios.tsx` |
| C05 | Ensaio | Menu **Ensaio** ou abrir `#ensaio` | [Abrir ensaio](http://127.0.0.1:5173/coordenacao.html#ensaio); exige sessão | `src/coord/Ensaio.tsx` |
| C05a | Confirmação de remoção da simulação | C05 → **Remover simulação** | Não altera URL | `src/coord/Ensaio.tsx` |

### Retornos e ações internas da coordenação

| Onde | Gatilho | Resultado |
| --- | --- | --- |
| Login | Nome/senha → **Entrar** | `POST /api/login`, depois `GET /api/eu`; abre a tela indicada pelo endereço, normalmente a fila |
| Cabeçalho autenticado | **Fila**, **Usuários**, **Ensaio** | Troca a tela e atualiza histórico/endereço |
| Cabeçalho autenticado | **Sair** | Tenta encerrar sessão, limpa filtros e endereço e exibe login |
| Fila | Alterar **Status** ou **Tipo** | Reconsulta a fila, mantendo a mesma tela |
| Fila filtrada | **Limpar filtros** | Restaura todos os status/tipos |
| Fila visível | A cada 8 segundos ou voltar à aba do navegador | Atualiza a fila automaticamente |
| Caso | Alterar **Status** ou **Gravidade** | Envia alteração à API e recarrega o detalhe |
| Caso: mensagens | Texto → **Enviar ao aluno** | Envia mensagem de 1 a 2000 caracteres e recarrega o caso |
| Caso: notas | Texto → **Salvar nota** | Salva nota de 1 a 2000 caracteres e recarrega o caso |
| Anexo ampliado | **Fechar**, Escape ou clique no fundo | Fecha janela e devolve foco ao gatilho |
| Usuários | Nome/senha → **Criar usuário** | Exige nome não vazio e senha de pelo menos 10 caracteres; envia criação e atualiza lista |
| Confirmação de desativação | **Confirmar desativação** | Envia desativação e atualiza lista |
| Confirmação de desativação | **Cancelar** ou Escape | Fecha confirmação sem desativar |
| Ensaio | **Carregar casos de simulação** | Solicita carga e mostra resultado; para vê-los, usar **Fila** |
| Confirmação de remoção | **Confirmar remoção** | Solicita remoção dos casos simulados e mostra resultado |
| Confirmação de remoção | **Cancelar** ou Escape | Fecha confirmação sem remover |
| Navegador | Voltar/avançar ou mudar hash | Atualiza a tela da coordenação conforme o endereço |

**Regras de endereço:** `#caso-ID` aceita de 1 a 9 dígitos. `#usuarios` e `#ensaio` abrem as telas correspondentes após autenticação. Hash ausente ou não reconhecido seleciona a fila. As abas e confirmações internas não têm URL própria. Não há link de troca entre os portais; as entradas são separadas.

## Estados condicionais e seus gatilhos

| Interface | Estado | Gatilho |
| --- | --- | --- |
| Início do aluno | Erro de código vazio | **Acompanhar** sem preencher código |
| Pedido de ajuda | Erro de validação | **Continuar**/**Enviar** com tipo ausente, relato fora do limite ou nome obrigatório ausente |
| Pedido de ajuda | Erro de anexo | Selecionar formato não aceito, arquivo acima de 5 MB ou mais de 5 imagens |
| Pedido de ajuda | Aviso de rascunho | Armazenamento local indisponível ou **Limpar rascunho** |
| Pedido de ajuda | Enviando | Pedido enviado à API; bloqueia campos e retornos durante a operação |
| Pedido de ajuda | Falha no envio | API/rede falha; mantém o relato na tela |
| Confirmação | Imagens recusadas | API aceita pedido e retorna `anexos_recusados` |
| Acompanhamento | Buscando caso / erro / conversa vazia | Consulta iniciada / API falha / caso retornado sem mensagens |
| Acompanhamento | Enviando resposta / sucesso / falha de atualização | Envio iniciado / API aceita / envio aceita, mas consulta seguinte falha |
| Login | Entrando / dados inválidos / servidor ocupado / limite de tentativas | Envio do login e respostas da API |
| Login | Sessão encerrada | Uma chamada da coordenação responde HTTP 401 com sessão antes autenticada |
| Fila | Carregando / vazia / sem resultados / erro | Consulta inicial / lista vazia / filtros sem resultados / API falha |
| Caso | Carregando / erro de carga | Abertura do caso / API falha; **Voltar à fila** permanece disponível |
| Caso | Sem anexos, sem motivos ou conversa vazia | Dados retornados sem os respectivos registros |
| Caso | Relato anônimo/identificado, quando/onde, selos | Campos e marcadores retornados pela API; aparecem dentro do detalhe |
| Usuários | Carregando / erro / criado / desativado | Consulta e operações na API |
| Ensaio | Resultado de carga/remoção ou erro | Resposta da operação correspondente |

## Dependências de API para alcançar os conteúdos

| Destino ou ação | Requisição |
| --- | --- |
| Confirmação do pedido | `POST /api/denuncias` |
| Status e conversa do aluno | `POST /api/acompanhar` |
| Resposta do aluno | `POST /api/acompanhar/mensagens` |
| Sessão da coordenação | `GET /api/eu` |
| Entrar / sair | `POST /api/login` / `POST /api/logout` |
| Fila e filtros | `GET /api/casos?status=...&tipo=...` (parâmetros opcionais) |
| Detalhe de caso | `GET /api/casos/{id}` |
| Imagem de anexo | `GET /api/casos/{id}/anexos/{anexoId}` |
| Alterar status / gravidade | `POST /api/casos/{id}/status` / `POST /api/casos/{id}/gravidade` |
| Mensagem / nota interna | `POST /api/casos/{id}/mensagens` / `POST /api/casos/{id}/notas` |
| Lista / criação de usuários | `GET /api/usuarios` / `POST /api/usuarios` |
| Desativar usuário | `POST /api/usuarios/{id}/desativar` |
| Carregar / remover simulação | `POST /api/simulacao/carregar` / `DELETE /api/simulacao` |

Referência das requisições e tratamento de sessão: `src/shared/api.ts`.

## Limites da verificação

Este índice descreve os caminhos implementados no código. Os fluxos protegidos e os resultados de envio não foram executados com backend nesta cópia. Na verificação anterior, um teste de foco por teclado das abas do caso falhou; os gatilhos por teclado descritos acima estão implementados, mas essa falha permanece sem correção.
