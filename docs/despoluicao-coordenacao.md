# Simplificação visual da coordenação

17/10/2026. Pedido: despoluir a interface usando Impeccable. Aplicação do playbook distill no modo Operate. Mantidos identidade, tipografia local, paleta, contratos da API e funções existentes.

## O que mudou e por quê

- Casca: retirada a frase fixa de apoio; o estado da conexão permanece visível em uma faixa menor.
- Visão geral: contagens por status viraram uma faixa de resumo, com menos contornos, números menores e sem uma segunda legenda repetindo o nome do indicador. Os botões e filtros correspondentes permanecem.
- Fila: recortes com seleção por sublinhado, um único contador de resultados visível e menos bordas coloridas. Anúncios continuam disponíveis ao leitor de tela. Explicações extensas ficam junto dos filtros detalhados. A justificativa que apenas repete o tipo do caso saiu da linha; motivos adicionais continuam visíveis e todos os motivos permanecem no detalhe.
- Atendimento: responsável e próxima ação aparecem como síntese. Editar responsável e ação abre o formulário. Rascunhos recuperados abrem a edição automaticamente; salvar e descartar recolhem os campos. Concluir ação continua acessível pela síntese.
- Caso: turma, local e último acesso ficam em Dados do caso; anonimato/identificação e data de recebimento continuam visíveis. Relato usa a largura disponível, com medida de leitura limitada, sem cartão dentro de cartão. Os motivos da prioridade vêm abaixo do conteúdo, sem uma coluna lateral que estreitava a leitura. Resolução continua disponível no fim.
- Mapa: removidos textos de abertura repetidos; filtros e legenda ficam no mesmo painel expansível. Contagem principal tem mais destaque que os indicadores de ausência de informação. Zoom, busca, níveis, edição e rolagem continuam disponíveis.

Não houve remoção de recurso nem alteração do banco, do portal do aluno ou das permissões de acesso. Sem novas imagens, bibliotecas, fontes externas ou efeitos de abertura.

## Verificação

- 203 testes da coordenação aprovados em 18 arquivos.
- 10 testes de CSP aprovados.
- Build da coordenação com TypeScript e Vite aprovado.
- Chrome: visão geral, fila, caso e mapa em 375 e 1280 px, nos temas claro e escuro. Sem transbordamento horizontal da página e sem erros de página no fluxo exercitado.
- Fluxo real: abrir edição por teclado; editar ação/data; sair e recuperar rascunho; descartar; abrir resolução; acessar conversa; abrir e usar filtros do mapa.
- Primeiro caso no celular: Y aproximado de 870 para 652 px, comparado à última versão auditada.
- Abas do detalhe no celular: Y aproximado de 1616 para 823 px, comparado à última versão auditada.
- Evidências e capturas: `.superpowers/sdd/2026-10-17-atendimento/distill/resultado.json` e PNGs da mesma pasta.

Foram feitas uma rodada de inspeção visual em lote e uma rodada final de confirmação, conforme o limite do Impeccable.

## Critério visual e gate do escopo

ENERGY 1 / RHYTHM 1 / MOTION 1: uso escolar previsível, organização por tarefa e movimento restrito a feedback existente.

- Hierarquia PASS: casos e relato ganharam espaço; formulário, dados complementares e filtros ficam sob títulos explícitos.
- Função PASS: funções existentes conservadas; testes de sessão, conflito, recuperação, mapa, conversa e resolução passaram.
- Responsividade PASS: largura da página igual ao viewport em todas as capturas medidas.
- Estados PASS: carregamento, vazio, erro e rascunho preservados; a fila mantém `aria-busy` e seus anúncios.
- Teclado/foco PASS no fluxo exercitado: detalhes nativos abertos por Enter e indicador de foco preservado; não se afirma certificação exaustiva de todo o aplicativo.
- Temas PASS no escopo visual capturado: uso dos mesmos tokens claro/escuro, sem cores fixas novas.
- Honestidade PASS: contagens continuam vindo da API; os dados da prévia são de uma base de teste separada.
- CSP PASS: os dez testes de compatibilidade passaram; não foram introduzidos estilos inline.

O build web da coordenação foi atualizado. O executável e o instalador em `dist/` não foram regenerados nesta tarefa.
