# Operação LAN — Segurança Integral 3.1.0

O instalador padrão é `dist/SegurancaIntegral-Setup-LAN.exe`. O programa atende dois portais em um processo gevent e usa SQLite local. Não precisa de internet, túnel ou serviços externos para operar. Uma instalação nova escuta `0.0.0.0`, nas portas 3000 (aluno) e 4000 (coordenação). O instalador libera essas portas somente nos perfis Privada e Domínio do Windows, preserva portas, dados e regras locais durante atualização e renova os endereços permitidos pelo helper LAN.

Instale no computador que ficará ligado durante o atendimento. Reserve um IP nesse computador e confira se a rede permite comunicação entre dispositivos. A conexão é HTTP: compartilhe os endereços apenas na rede escolar e não encaminhe as portas no roteador. O sistema não registra o endereço de quem envia pedidos; a infraestrutura da escola pode registrar acessos.

Crie a primeira conta abrindo a coordenação no próprio servidor (`http://127.0.0.1:4000`, ajustando a porta se necessário). O bootstrap remoto é recusado. Os dados ficam, por padrão, em `C:\ProgramData\SegurancaIntegral`, com acesso restrito a Administradores e SYSTEM. Execute os comandos abaixo num terminal local com acesso a essa pasta.

## Consulta e monitor

```powershell
& 'C:\Program Files\SegurancaIntegral\SegurancaIntegral.exe' --status
& 'C:\Program Files\SegurancaIntegral\SegurancaIntegral.exe' --status --watch
& 'C:\Program Files\SegurancaIntegral\SegurancaIntegral.exe' --data-dir 'D:\DadosSeguranca' --status --json
```

Sem `--data-dir`, usa a pasta padrão do Windows. O monitor não cria pasta, banco, chaves ou conta; não faz backup, reinicia serviço ou altera configuração. Lê somente `config.json` e consulta `GET /api/servidor` nas duas portas via `127.0.0.1`, com prazo total de um segundo por porta, incluindo conexão, cabeçalhos e corpo, e sem usar proxies do ambiente. Pasta inexistente é offline, sem consultar outro serviço nas portas padrão. Os endereços exibidos vêm de `allowed_hosts`: a consulta local não confirma que outro aparelho consegue acessá-los.

`--watch` consulta novamente após dois segundos; Ctrl+C encerra apenas o monitor e devolve o código do último estado observado. `--json` faz uma consulta única e não combina com `--watch`. `--watch` e `--json` exigem `--status`; status é incompatível com criar administrador ou redefinir senha. Argumentos inválidos são recusados antes de qualquer efeito sobre os dados.

| Estado | Significado e ação local | Saída |
| --- | --- | --- |
| `saudavel` | Ambos os portais respondem com identidade `seguranca-integral`, versão `3.1.0`, portal correto, banco íntegro e backup sem erro observado. | 0 |
| `offline` | Pasta ausente ou nenhuma porta respondeu. Confira a pasta e a tarefa `SegurancaIntegral` no Agendador de Tarefas. | 1 |
| `degradado` | Uma porta falhou, há serviço desconhecido/incompatível, banco indisponível ou erro de backup. Confira os estados individuais. | 1 |
| `servico_desconhecido` em um portal | HTTP respondeu sem o contrato esperado, com outra versão/produto/portal, ou resposta incompleta. Confira o processo que usa a porta e a versão instalada. | 1 |
| `configuracao_invalida` | Arquivo ilegível, JSON inválido, host/portas/limites inválidos ou caminho que não é pasta. Corrija `config.json` localmente. | 4 |
| Uso inválido | Confira `--help`; o monitor não inicializou os dados. | 2 |

O diagnóstico inclui somente produto, versão, portal, uptime em segundos, saúde do banco, estado/data do backup e quantidade de assinantes SSE do processo. Ambos os portais compartilham uptime, backup e central SSE. A verificação abre SQLite em modo somente leitura e fecha a conexão imediatamente. Não entrega nomes, relatos, mensagens, códigos, chaves, notas ou IDs de casos. A rota recusa clientes LAN e cabeçalhos de proxy, inclusive quando a conexão vem do loopback.

Backup `pendente` significa que este processo ainda não observou uma tentativa. Um backup antigo, inclusive de hoje, não comprova sucesso atual: na partida, se a cópia do dia já existe, ela é preservada e o estado continua pendente. `ok` e `erro` mostram a data UTC da última tentativa realmente observada. A rotina roda na partida quando necessário e depois a cada 24 horas. Um erro mantém o serviço atendendo, mas o monitor indica degradação. Verifique espaço livre, permissões e `logs/servidor.log`; depois de corrigir, aguarde a rotina ou reinicie o serviço quando for adequado ao atendimento.

## Backup e recuperação

As cópias em `backups/AAAA-MM-DD` incluem `seguranca.db`, `uploads`, `secret.key`, `config.json` e, quando existirem na pasta de dados, `questionario.json`, `questionario_v3.json` e `risk_terms.json`. Os questionários e termos personalizados precisam acompanhar a restauração para manter as regras locais. A `sessao.key` não faz parte do backup. Guarde cópias fora do computador em local protegido; a retenção automática local é de sete dias.

Para restaurar, pare a tarefa agendada e confira que o processo terminou. Preserve uma cópia da pasta atual, copie o conteúdo de um backup completo para a pasta de dados protegida e mantenha a `secret.key` correspondente ao banco: ela valida os códigos dos alunos. Não misture banco e chaves de cópias diferentes. Confirme os questionários/termos personalizados e `config.json`, preservando as portas esperadas. Inicie a tarefa, consulte `--status` e confira os dois portais. A instalação/atualização renova os endereços locais quando o IP mudou. Não restaure `sessao.key` de outra máquina.

Cada reinício requer novo login da coordenação: o registro revogável de sessões e a presença são mantidos em memória. Os códigos dos alunos continuam válidos com a `secret.key` original. Para recuperar a conta local `coordenacao`, pare a tarefa, execute `SegurancaIntegral.exe --redefinir-senha` com a mesma pasta de dados e reinicie a tarefa; a senha aparece uma vez no terminal. `--criar-admin` cria essa conta apenas se ela ainda não existir.

## Dados do mapa escolar

A planta, os vínculos dos locais, a turma de quem relata e os autores registrados na finalização ficam no mesmo banco SQLite. A migração cria uma cópia `seguranca.db.pre-v4.bak` antes de alterar um banco existente e mantém os casos/códigos antigos. Ao ampliar uma planta existente para suportar formato em L, cria também `seguranca.db.pre-mapa-l.bak` antes de adicionar a geometria, preservando a cópia anterior. Registros antigos sem esses campos continuam consultáveis e aparecem sem informação nas análises; não são classificados retroativamente.

As fotos internas dos autores ficam em `uploads/` e acompanham o backup completo existente. A coordenação precisa de sessão válida para consultá-las. O catálogo do aluno contém só nomes e hierarquia dos ambientes. Para recuperar mapa e fotos, restaure banco e uploads da mesma cópia, junto às chaves e configuração conforme o procedimento acima.

O mapa considera a data de criação do caso no período selecionado; na base de autores usa a última resolução. Simulações ficam fora das contagens. Ambientes vinculados não podem ser excluídos, preservando o histórico do local registrado.

## Geração do pacote para revisão

Com a venv e `frontend/node_modules` já preparados e Inno Setup 6.3+ disponível:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer\build.ps1
```

O build compila os portais, executa o backend, empacota o executável com PyInstaller e compila o instalador LAN. Não instala dependências nem executa o instalador, helper LAN, firewall ou tarefas agendadas. `-Lan` continua aceito por compatibilidade; a versão 3 só gera LAN. `-SemInstalador` gera apenas a pasta do executável. Use `-SemTestes` somente quando a suíte completa do mesmo working tree já tiver sido executada e registrada; o build dos dois portais continua obrigatório. Rode as suítes frontend, TypeScript e contraste antes da entrega. Não execute builds simultâneos com testes que dependem de `backend/app/static`, porque Vite limpa esse diretório ao compilar.

Teste o executável com uma pasta temporária e host explícito `127.0.0.1`. Gerar o Setup não comprova instalação em máquina limpa; esse ensaio deve ser feito separadamente em ambiente autorizado.


## Implantação secundária: limpar todos os dados

> **Atenção: a implantação normal NUNCA deve ligar esta chave.** Ela existe só para instalações de teste, treinamento ou demonstração. Com ela ligada, o primeiro administrador pode apagar todos os casos e conversas da instalação, sem desfazer.

**Como ligar.** No `config.json` da pasta de dados, acrescente `"implantacao_secundaria": true`. O valor precisa ser exatamente `true` ou `false` (sem aspas; qualquer outro valor é erro de configuração e o serviço não inicia). A chave vale depois de reiniciar o serviço. Sem a chave, ou com `false`, o botão e as rotas `/api/implantacao` não existem (respondem 404). O instalador não liga a chave sozinho.

**Quem usa.** Só o **primeiro admin**, isto é, o administrador de menor id (a conta criada no primeiro acesso). Se essa conta estiver desativada, ninguém consegue limpar. Outro administrador ou um coordenador recebe 403. O botão fica no cartão **Implantação secundária**, no fim da tela **Usuários**, e a tela mostra a data da última limpeza.

**Como funciona.** O painel pede a senha do próprio usuário e a frase `APAGAR TUDO`. Cinco senhas erradas aqui bloqueiam também o login desse administrador, porque o contador de tentativas é o mesmo do login. A caixa **Apagar também as cópias de segurança** vem marcada e pode ser desmarcada.

**O que apaga:** casos, conversas (mensagens e versões), anexos, notas internas, histórico, resoluções, fotos dos autores, respostas e recibos de envio, e os arquivos de `uploads\`. Por padrão apaga também as subpastas de `backups\` e todos os `seguranca.db.pre-*.bak` ao lado do banco. Os números dos casos recomeçam do 1. O SQLite é compactado (`VACUUM`) para não guardar o texto apagado em páginas livres. Os códigos de acompanhamento dos alunos deixam de valer, e os acessos salvos no navegador deles ficam sem efeito.

**O que preserva:** usuários (contas, senhas e papéis), o mapa da escola, o `config.json` e as chaves (`secret.key`, `sessao.key`). Fica um registro mínimo da limpeza (quem, quando e quantos casos), sem nenhum texto de caso.

**O que a limpeza não cobre:** o arquivo de log do servidor (`logs\servidor.log` e os rotacionados), que pode citar texto em mensagens de erro; os rascunhos guardados no navegador de outros coordenadores e dos alunos; e um upload feito durante a limpeza, que pode ser apagado (janela de milissegundos).

**Não há como desfazer.** Com as cópias de segurança apagadas, também não há de onde restaurar. Se houver alguma dúvida, desmarque a caixa das cópias ou não use o botão.

**Como desligar depois.** Remova a chave `implantacao_secundaria` do `config.json` (ou troque para `false`) e reinicie o serviço. O botão e as rotas deixam de existir.
