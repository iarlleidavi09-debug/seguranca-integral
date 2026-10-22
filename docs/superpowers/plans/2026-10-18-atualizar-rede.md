# Atualização da rede para demonstrações

Objetivo: permitir trocar de Wi-Fi sem reinstalar o MVP, usando Atualizar rede no Menu Iniciar. A implementação permanece nos scripts PowerShell do instalador.

- [x] Testar troca de IP, preservação de portas/limites/hosts manuais e falha sem IPv4 utilizável.
- [x] Atualizar lan.ps1 para substituir hosts gerenciados, manter configuração manual e produzir orientações atuais.
- [x] Criar atualizar-rede.ps1: elevar permissões, atualizar configuração, reiniciar a tarefa existente, verificar os dois portais e abrir relatório. Falhas não podem aparecer como sucesso.
- [x] Integrar atalhos Atualizar rede e Iniciar servidor ao fluxo; documentar rede Pública e isolamento de clientes.
- [x] Executar testes de empacotamento e comportamento PowerShell; recompilar o Setup LAN e atualizar checksums.

Não altera o perfil de rede, não libera firewall Público e não muda banco, contas ou dados. A validação local não promete alcance a partir de outro aparelho. Sem reinício automático por evento de Wi-Fi nesta implementação: atualização explícita pelo atalho.
