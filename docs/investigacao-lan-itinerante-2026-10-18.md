# Investigação: notebook mudando de rede LAN

Data: 18/10/2026. Usuário confirma que o portal abre no notebook, mas não no celular após mudar de Wi-Fi.

## Conclusão confirmada no código e em reprodução isolada

O IP local é atribuído pela rede e pode mudar entre escolas. O servidor escuta em 0.0.0.0 na instalação LAN, mas a lista allowed_hosts e Enderecos-da-rede.txt são atualizadas pelo lan.ps1 somente quando o instalador executa. A tarefa agendada inicia o executável sem atualizar a configuração de rede. Iniciar servidor também não atualiza essa lista. Reiniciar o processo sozinho recarrega a mesma lista antiga.

A validação em backend/app/security.py captura a lista permitida na criação da aplicação. A alteração de config.json exige reinício para surtir efeito. O monitor --status exibe os hosts do arquivo; não os redescobre na rede.

Reprodução com Flask e configuração temporária, sem tocar na instalação: loopback 200; IP original 200; IP de outra rede 400 com host invalido; atualizar apenas o arquivo ainda resulta em 400; recriar a aplicação com a configuração atual resulta em 200.

## Outras causas a distinguir no notebook

O firewall criado pelo instalador permite apenas redes Private e Domain. Uma nova rede classificada Public pode bloquear a chegada da conexão. A escola também pode isolar clientes ou usar redes de visitantes distintas. Essas condições não foram medidas no notebook da demonstração; não se afirma que sejam a causa específica observada. Um timeout indica caminho de rede/firewall/isolamento a investigar; host invalido indica chegada à aplicação com endereço não autorizado.

## Procedimento com a versão atual

Conectar o notebook e o celular à mesma rede que permita comunicação entre dispositivos. Executar novamente o instalador LAN nessa rede atualiza os hosts, regenera Enderecos-da-rede.txt e reinicia a tarefa; o fluxo preserva dados e contas. Usar no celular o IP atual indicado no arquivo, com porta 3000 para aluno ou 4000 para coordenação. 127.0.0.1 no celular aponta para o próprio celular. Se a rede está Public, a regra atual não se aplica; qualquer mudança de perfil deve corresponder à confiança na rede e às regras da escola.

## Correção proposta, ainda não implementada

Adicionar um fluxo explícito de atualização/diagnóstico da rede para demonstrações: descobrir IPs ativos, atualizar a lista permitida e o endereço compartilhável, aplicar a configuração ao servidor e informar perfil de firewall e limitações da rede. Não liberar todos os hosts nem alterar silenciosamente o perfil das redes.

Fontes: installer/lan.ps1, installer/tarefas.ps1, installer/instalador.iss, backend/app/security.py, backend/app/server.py e backend/app/status_cli.py. Nenhuma alteração funcional ou novo instalador nesta investigação.