# Telas e nós do Figma: Segurança Integral v1

Arquivo: https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP

**Estado: incompleto.** A construção parou quando a conta atingiu o limite de chamadas
do MCP do Figma no plano Starter (assento "View"). As fundações e a maior parte dos
componentes existem; nenhuma tela foi montada ainda.

## Páginas

O plano Starter permite 3 páginas, então `Fundações` e `Componentes` dividem a mesma
página, em duas seções.

| Página | Conteúdo | Estado |
| --- | --- | --- |
| Fundações e Componentes | seções `Fundações` e `Componentes` | feito em parte |
| Aluno | telas do portal do aluno | vazia |
| Coordenação | telas do portal da coordenação | vazia |

## Fundações

| Item | Nó |
| --- | --- |
| Seção Fundações | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=5-2 |
| Guia de estilo (cores nos dois temas, tipografia, espaçamento, raios) | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=5-3 |

## Componentes (seção 6:2)

| Componente | Variantes | Nó |
| --- | --- | --- |
| Seção Componentes | | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=6-2 |
| Ícones (36 componentes `Ícone/...`) | | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=6-3 |
| Botão | Tipo: Primário, Secundário, Perigo, Fantasma; Estado: Padrão, Foco, Desabilitado | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-62 |
| Campo de texto | Estado: Padrão, Foco, Erro | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-88 |
| Área de texto | Estado: Padrão, Foco, Erro | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-114 |
| Opção de tipo (seletor de tipo de caso) | Selecionado: Não, Sim | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-128 |
| Chip de gravidade | Nível: Alta, Média, Baixa | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-150 |
| Chip de status | Novo, Em análise, Aguardando aluno, Encaminhado, Resolvido | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-179 |
| Selo simulação | | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=7-186 |
| Cartão de caso | Gravidade: Alta, Média, Baixa; Layout: Linha, Compacto | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-196 |
| Bolha de mensagem | Autor: Aluno, Coordenação | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-207 |
| Nota interna | | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-216 |
| Miniatura de anexo | Estado: Pronto, Enviando, Recusado | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-254 |
| Aviso | Tipo: Informação, Atenção, Erro, Sucesso | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-290 |
| Consentimento | | https://www.figma.com/design/in0L4M1kTj7VeT3kGrw8CP?node-id=9-317 |

Pendências nos componentes:

- `Nota interna` (9:216) e `Consentimento` (9:317) ficaram soltos na página, fora da
  seção Componentes; mover para dentro dela.
- `Cartão de caso`, layout Compacto (9:83, 9:139, 9:195): o quadro vazio `Espaço`
  dentro de `Topo` deixa o cabeçalho alto demais. Remover e usar
  `SPACE_BETWEEN` em `Topo`.
- Faltam: estado de carregamento e de erro em bloco, indicador de passos, aba,
  barra superior do aluno, menu lateral da coordenação, evento da linha do tempo e
  tag de motivo da triagem.

## Telas planejadas (ainda não construídas)

Tema escuro: clonar cada tela clara e trocar as variáveis da coleção `Tema Claro`
pelas de mesmo nome da `Tema Escuro` (não há modos no plano Starter).

### Aluno (375 px, claro e escuro)

| Tela | Claro | Escuro |
| --- | --- | --- |
| Início | pendente | pendente |
| Denúncia, passo 1 de 3: Tipo | pendente | pendente |
| Passo 2 de 3: Relato | pendente | pendente |
| Passo 3 de 3: Provas e identificação | pendente | pendente |
| Confirmação (código K7M2-9QXD) | pendente | pendente |
| Acompanhar | pendente | pendente |
| Estado: erro de envio com rascunho salvo | pendente | pendente |
| Estado: código não encontrado | pendente | pendente |
| Estado: limite de tentativas (429) | pendente | pendente |
| Estado: anexo recusado | pendente | pendente |

### Coordenação (1280 px, claro e escuro; fila também a 375 px)

| Tela | Claro | Escuro |
| --- | --- | --- |
| Login | pendente | pendente |
| Fila | pendente | pendente |
| Fila 375 px | pendente | pendente |
| Caso | pendente | pendente |
| Usuários | pendente | pendente |
| Ensaio | pendente | pendente |
