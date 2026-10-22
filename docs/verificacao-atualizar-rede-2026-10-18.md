# Atualizar rede para demonstrações - 18/10/2026

## Implementado

Menu Iniciar > Segurança Integral > Atualizar rede. O atalho pede elevação quando necessário, detecta IPv4 dos adaptadores ativos, atualiza os hosts permitidos, reaplica a regra LAN Private/Domain, reinicia a tarefa existente e verifica produto, versão, portal e banco nos dois endpoints locais. Ao concluir, abre Endereços da rede com data de atualização e orientações. Iniciar servidor usa o mesmo fluxo e abre a coordenação na porta configurada.

A troca de Wi-Fi exige executar o atalho; não há monitor automático de mudanças. Redes Públicas são identificadas no relatório, sem alterar o perfil nem abrir esse perfil no firewall. O teste local não comprova acesso pelo celular ou ausência de isolamento entre clientes.

Portas, limites, contas e dados são preservados. Hosts manuais permanecem. Hosts adicionados pela automação são substituídos quando o IP muda; endereços legados sem informação de origem são conservados para evitar apagar entradas manuais. Cópia anterior do config.json em config.json.bak. Sem IPv4 utilizável, o atualizador falha antes de modificar a configuração ou reiniciar a tarefa. A instalação offline continua permitida para acesso local.

## Verificação

- Ciclo inicial: cinco testes falharam antes da implementação, reproduzindo os contratos ausentes.
- Revisão identificou preservação de IP manual coincidente e instalação offline; ambos corrigidos e cobertos por regressões.
- 112 testes aprovados: tests/test_rede_itinerante.py, test_empacotamento.py, test_lan_v3_package.py e test_config.py.
- Testes de reinício exercitam a função real com tarefa e HTTP simulados, incluindo diagnóstico de banco não saudável.
- Dois scripts analisados pelo parser PowerShell e conferidos como ASCII para Windows PowerShell 5.1.
- Descoberta dos adaptadores reais executada com -SemFirewall e pasta temporária: dois endereços identificados, sem modificar rede, tarefa ou instalação.
- Inno Setup compilou o instalador e o log confirma inclusão de atualizar-rede.ps1.
- Arquivos web do executável existente comparados por hash com o build atual. Backend e frontend não sofreram alterações nesta implementação; reutilizado o executável validado na geração anterior.
- Não foi executada a instalação no Windows nem uma troca física de Wi-Fi no notebook da demonstração. Elevação/UAC, atalhos instalados e alcance por celular ainda precisam ser conferidos nesse notebook.

## Arquivos

installer/atualizar-rede.ps1; installer/lan.ps1; installer/instalador.iss; installer/LEIA-ME-LAN.txt; backend/tests/test_rede_itinerante.py.

## Entrega

dist/SegurancaIntegral-Setup-LAN.exe
Versão: 3.0.0; tamanho: 15661300 bytes.
SHA-256: 3094209E091AC81A9E47AF4EA779F519323B33750627A0EC0CE6DF8DE036B356
Log: dist/inno-rede-2026-10-18.log. Checksums do instalador e do executável atualizados.