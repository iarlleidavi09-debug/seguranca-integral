# Qualidade de vida e refinamento visual

> Execução: superpowers:subagent-driven-development, com trabalho dividido por arquivos e integração nesta sessão.

**Objetivo:** implementar os sete itens aprovados e mostrar o código de acompanhamento dentro do caso relacionado na coordenação.

**Arquitetura:** React/TypeScript e API Python existentes, sem novos serviços. Preservar alterações locais e identidade visual. Rascunhos sensíveis apenas na sessão em memória; favoritos por usuário sem texto de busca sensível. Código disponível somente ao aluno autorizado pelo código e à equipe autenticada no detalhe.

**Especificação:** aprovação do usuário nesta conversa: todos os sete itens; complemento do item 7 e revisão de design.

## Tarefas e validação

- [x] 1. Proteger rascunhos de conversa/notas por caso na sessão, limpar em logout/perda de sessão; proteger mensagem do aluno e oferecer modelos editáveis sem envio automático. Testes de troca/retorno, isolamento, limpeza e inserção de modelo.
- [x] 2. Preservar origem, rolagem e destaque ao retornar à fila; navegar anterior/próximo conforme ordem filtrada. Testes de retorno a Meus casos e limites da navegação.
- [x] 3. Favoritos de filtros por usuário, com nome, aplicação e remoção, tolerância a armazenamento indisponível. Testes de isolamento e valores inválidos.
- [x] 4. Recuperar anexos pelo acompanhamento com endpoint POST autenticado pelo código no corpo, limites existentes, validação de imagem, erros parciais e notificação da equipe. Testes de autenticação, limites e upload.
- [x] 5. Agenda com Hoje/Atrasados/Próximos dias e ações de concluir/reagendar usando revisão de concorrência existente. Testes de datas e ações.
- [x] 6. Exibir código existente no detalhe autorizado, copiar com fallback LAN e comprovante simples imprimível. Não regenerar códigos nem expor na fila/URL. Testes de API e cópia.
- [x] 7. Refinar agrupamento visual das novas ferramentas e navegação, estados de foco/erro/vazio e responsividade. Inspeção desktop/celular.
- [x] 8. Integrar, revisar alterações, executar testes pertinentes de ambos portais/backend e builds TypeScript/Vite. Registrar limitações reais.

## Pontos de revisão

- Troca de caso não mistura rascunhos nem mensagens enviadas.
- Logout remove estado sensível e favoritos não vazam entre usuários.
- Código permanece somente no corpo do POST para o aluno.
- Reenvio de anexos mantém o caso existente e respeita tamanho, formato e limites.
- Agenda usa America/Sao_Paulo e mantém proteção de revisão concorrente.
- Fila preserva contexto sem persistir dados pessoais no endereço.

## Decisões

- Trabalhar na branch existente feature/v1, pois há edições locais relevantes do usuário; não mover nem descartar essas edições.
- Refinamento visual conserva tipografia, cores e componentes existentes, sem redesenho completo.

## Evidências finais

- Coordenação: 32 arquivos e 344 testes passaram; aluno/shared: 31 arquivos e 358 testes passaram.
- Backend: 13 testes finais passaram (12 de códigos/anexos e o contrato de acompanhamento atualizado); rodada anterior do agente também validou replay v3 e privacidade do detalhe/aluno (15 testes).
- A execução ampla do backend foi encerrada depois de reproduzir uma expectativa antiga de campos do acompanhamento. O teste foi atualizado para incluir `anexos_total` e passou na rodada final focada; não se afirma aprovação da suíte completa do backend.
- `npm run build:coord` e `npm run build:aluno` passaram, incluindo TypeScript, e atualizaram os assets locais.
- Chrome com builds de produção e APIs fictícias: favoritos, código relacionado, fila anterior/próximo, retorno à origem, rascunhos, anexos e ausência de overflow em 375/768px. Capturas em `frontend/verificacao/qualidade-de-vida/`.
- Revisão independente encontrou e corrigiu uma corrida de logout: respostas de uma sessão antiga não podem limpar um rascunho idêntico de outra sessão.
- Rascunhos de conversa são temporários nesta aba/sessão e não sobrevivem a recarga confirmada. Códigos históricos sem original tornam-se disponíveis após acesso válido do aluno.
