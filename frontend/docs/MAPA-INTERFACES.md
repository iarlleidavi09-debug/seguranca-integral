# Mapa e índice das interfaces

As definições atuais estão em [docs/DEFINICOES.md](docs/DEFINICOES.md). A seção da coordenação descreve o portal da v2 (3 status, 4 prioridades, resolução e pós-resolução); a do aluno segue a base original.

Prévias aprovadas: [aluno jovem e expressivo](http://127.0.0.1:5173/aluno-revisao.html) e [coordenação acolhedora](http://127.0.0.1:5173/revisao.html). O índice da base original permanece em [interfaces.html](http://127.0.0.1:5173/interfaces.html).

Mapeamento do frontend copiado, baseado nos componentes e seus gatilhos de navegação. Inclui telas, etapas, abas, janelas e estados condicionais.

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
  B -->|Sem sessão| P{Existe alguma conta?}
  P -->|Não| S[Primeiro acesso]
  P -->|Sim| C[Login]
  S -->|Criar conta de administrador| D
  B -->|Sessão válida| D[Tela indicada pelo endereço]
  C -->|Entrar e sessão confirmada| D
  D --> G0[Visão geral]
  D --> E[Casos]
  D --> PR[Pós-resolução]
  D --> F[Usuários, só administrador]
  D --> G[Ensaio]
  G0 -->|Atalho de contagem| E
  G0 -->|Abrir um caso que pede atenção| H
  E -->|Clicar na linha de um caso| H[Caso]
  PR -->|Clicar na linha de um caso| H
  H -->|Voltar aos casos| E
  H -->|Reavaliar prioridade| H1[Nova prioridade e justificativa]
  H -->|Registrar resolução| H2[Desfecho, providências e resultado]
  H -->|Caso resolvido ou recorrência pendente| H3[Acompanhamento após a resolução]
  H3 -->|Marcar como revisada| H
  H -->|Conversa| I[Aba de conversa]
  H -->|Notas internas| J[Aba de notas]
  H -->|Clicar na miniatura| K[Janela Anexo ampliado]
  F -->|Desativar outro usuário ativo| L[Confirmar desativação]
  G -->|Remover simulação| M[Confirmar remoção]
  D -->|Sair ou API responder 401| C
```

| ID | Interface | Gatilho para chegar | Endereço/condição | Componente |
| --- | --- | --- | --- | --- |
| C00 | “Verificando a sessão.” | Abrir/recarregar a coordenação | Consulta inicial `GET /api/eu` | `src/coord/App.tsx` |
| C01 | Login: “Portal da coordenação” | Verificação sem sessão, **Sair** ou perda da sessão | Visível em qualquer endereço sem sessão, dentro do tema | `src/coord/Login.tsx` |
| C01a | Login: “Tentar de novo” | Login aceito, mas leitura da sessão falha | Oculta nome/senha e repete apenas `GET /api/eu` | `src/coord/Login.tsx` |
| C01b | Primeiro acesso | Sem sessão e banco sem contas | Só na máquina do servidor; fora dela, apenas orientação | `src/coord/Setup.tsx` |
| C02 | Visão geral | Login no endereço base, ou menu **Visão geral** | [Abrir visão geral](http://127.0.0.1:5173/coordenacao.html); contagens de `GET /api/resumo` | `src/coord/Geral.tsx` |
| C03 | Casos | Menu **Casos**, atalho da Visão geral ou **Voltar aos casos** | `#casos`; busca, status, prioridade e tipo | `src/coord/Fila.tsx` |
| C03p | Pós-resolução | Menu **Pós-resolução** | `#pos-resolucao`; só casos resolvidos | `src/coord/Fila.tsx` (modo pós) |
| C04 | Detalhe do caso | C03 ou C03p → clicar na linha, ou abrir `#caso-ID` | Exemplo: `/coordenacao.html#caso-123`; exige sessão e caso existente | `src/coord/Caso.tsx` |
| C04a | Aba “Relato e investigação” | Padrão ao abrir C04 | Relato, quando, onde e anexos; mesmo endereço do caso | `src/coord/Caso.tsx` |
| C04b | Aba “Conversa” | C04 → **Conversa** | Mensagens ao aluno | `src/coord/Conversa.tsx` |
| C04c | Aba “Notas internas” | C04 → **Notas internas** | Só a coordenação vê; setas, Home e End alternam as abas | `src/coord/Conversa.tsx` |
| C04d | Aba “Histórico” | C04 → **Histórico** | Eventos com autoria | `src/coord/Caso.tsx` |
| C04e | Janela “Anexo ampliado” | C04a → clicar na miniatura | Exige anexo disponível; não altera URL | `src/coord/Anexos.tsx` |
| C04f | Reavaliar prioridade | C04 → **Reavaliar prioridade** | Nova prioridade e justificativa de 1 a 2000 caracteres | `src/coord/ReavaliarPrioridade.tsx` |
| C04g | Registrar resolução | C04 com caso não resolvido | Desfecho, providências e resultado opcional; 409 se já resolvido | `src/coord/RegistrarResolucao.tsx` |
| C04h | Acompanhamento após a resolução | C04 com caso resolvido ou recorrência pendente | Resolução mais recente, situações informadas e revisão de recorrência | `src/coord/PosResolucao.tsx` |
| C05 | Usuários + formulário “Novo usuário” | Menu **Usuários** (administrador) ou `#usuarios` | [Abrir usuários](http://127.0.0.1:5173/coordenacao.html#usuarios); mostra o papel de cada pessoa | `src/coord/Usuarios.tsx` |
| C05a | Confirmação de desativação | C05 → **Desativar** | Só para outro usuário ativo; a própria conta não se desativa | `src/coord/Usuarios.tsx` |
| C06 | Ensaio | Menu **Ensaio** ou `#ensaio` | [Abrir ensaio](http://127.0.0.1:5173/coordenacao.html#ensaio) | `src/coord/Ensaio.tsx` |
| C06a | Confirmação de remoção da simulação | C06 → **Remover simulação** | Não altera URL | `src/coord/Ensaio.tsx` |

### Retornos e ações internas da coordenação

| Onde | Gatilho | Resultado |
| --- | --- | --- |
| Login | Nome/senha → **Entrar** | `POST /api/login`, depois `GET /api/eu`; abre a tela indicada pelo endereço, normalmente a Visão geral |
| Navegação lateral | **Visão geral**, **Casos**, **Pós-resolução**, **Usuários**, **Ensaio** | Troca a tela e atualiza histórico/endereço; Pós-resolução mostra o número de recorrências pendentes |
| Navegação lateral | **Sair** | Tenta encerrar a sessão, limpa filtros e endereço e exibe o login |
| Visão geral | Atalho de contagem | Abre Casos já filtrado pelo status ou pela prioridade escolhida |
| Casos | Busca, **Status**, **Prioridade** ou **Tipo** | Reconsulta a lista; a busca aceita até 100 caracteres |
| Casos filtrados | **Limpar filtros** | Restaura todos os filtros |
| Casos e Pós-resolução | A cada 8 segundos ou voltar à aba do navegador | Atualiza a lista automaticamente |
| Caso | Alterar **Status** (novo ou em investigação) | Envia a alteração e recarrega o detalhe |
| Caso resolvido | **Reabrir para investigação** | Volta o status para em investigação |
| Caso | **Reavaliar prioridade** → confirmar | Envia prioridade e justificativa; o histórico guarda a justificativa |
| Caso | **Registrar resolução** | Envia desfecho, providências e resultado (visíveis para o aluno) |
| Caso com recorrência pendente | Revisar a recorrência | Envia `POST .../revisao-recorrencia` com corpo vazio |
| Caso: conversa | Texto → **Enviar ao aluno** | Envia mensagem de 1 a 2000 caracteres e recarrega o caso |
| Caso: notas | Texto → **Salvar nota** | Salva nota de 1 a 2000 caracteres e recarrega o caso |
| Anexo ampliado | **Fechar**, Escape ou clique no fundo | Fecha a janela e devolve o foco ao gatilho |
| Usuários | Nome/senha → **Criar usuário** | Exige nome não vazio e senha de pelo menos 10 caracteres |
| Confirmação de desativação | **Confirmar desativação** | Envia a desativação e atualiza a lista |
| Confirmação de desativação | **Cancelar** ou Escape | Fecha a confirmação sem desativar |
| Ensaio | **Carregar casos de simulação** | Solicita a carga e mostra o resultado; para vê-los, abrir **Casos** |
| Confirmação de remoção | **Confirmar remoção** | Remove os casos simulados e mostra o resultado |
| Confirmação de remoção | **Cancelar** ou Escape | Fecha a confirmação sem remover |
| Navegador | Voltar/avançar ou mudar o hash | Atualiza a tela conforme o endereço |

**Regras de endereço:** `#caso-ID` aceita de 1 a 9 dígitos. `#casos`, `#pos-resolucao`, `#usuarios` e `#ensaio` abrem as telas correspondentes após autenticação. Hash ausente ou não reconhecido seleciona a Visão geral. Coordenador sem papel de administrador não vê `#usuarios`. As abas, os formulários e as confirmações internas não têm URL própria. Não há link de troca entre os portais; as entradas são separadas.

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
| Casos e Pós-resolução | Carregando / vazia / sem resultados / erro | Consulta inicial / lista vazia / filtros sem resultados / API falha |
| Caso | Carregando / erro de carga | Abertura do caso / API falha; **Voltar aos casos** permanece disponível |
| Caso | Conflito (409) ao resolver ou revisar | Outra pessoa já registrou; a mensagem orienta e o caso é recarregado |
| Caso | Sem anexos, sem motivos ou conversa vazia | Dados retornados sem os respectivos registros |
| Caso | Relato anônimo/identificado, quando/onde, selos | Campos e marcadores retornados pela API; aparecem dentro do detalhe, incluindo o último acesso |
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
| Contagens da Visão geral e da navegação | `GET /api/resumo` |
| Casos e Pós-resolução | `GET /api/casos?status=...&prioridade=...&tipo=...&q=...` (parâmetros opcionais; devolve `motivos`, `recorrencia_pendente`, `ultimo_acesso_por` e `ultimo_acesso_em`) |
| Detalhe de caso | `GET /api/casos/{id}` (inclui `resolucoes`, `situacoes`, `revisoes_recorrencia` e `ultimo_acesso`) |
| Imagem de anexo | `GET /api/casos/{id}/anexos/{anexoId}` |
| Alterar status / prioridade | `POST /api/casos/{id}/status` / `POST /api/casos/{id}/prioridade` |
| Registrar resolução | `POST /api/casos/{id}/resolucao` |
| Revisar recorrência | `POST /api/casos/{id}/revisao-recorrencia` (corpo `{}`) |
| Primeiro acesso | `GET /api/setup` / `POST /api/setup` |
| Mensagem / nota interna | `POST /api/casos/{id}/mensagens` / `POST /api/casos/{id}/notas` |
| Lista / criação de usuários | `GET /api/usuarios` / `POST /api/usuarios` |
| Desativar usuário | `POST /api/usuarios/{id}/desativar` |
| Carregar / remover simulação | `POST /api/simulacao/carregar` / `DELETE /api/simulacao` |

Referência das requisições e tratamento de sessão: `src/shared/api.ts`.

## Limites da verificação

Este índice descreve os caminhos implementados no código. Os testes do portal rodam contra um servidor falso; a verificação com backend real e Chrome fica em `verificacao/coordenacao.mjs`. A prévia `interfaces.html` usa dados fictícios no formato da v2 e não envia nada ao backend.
