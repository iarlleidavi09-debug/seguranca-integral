# Primeiro acesso e papéis da coordenação

- Enquanto o banco não tem nenhum usuário, o portal da coordenação (porta 4000) abre na tela **Criar conta de administrador** em vez do login.
- A criação só é aceita **na máquina do servidor** (`127.0.0.1`/`::1`) e só quando o pedido não traz cabeçalhos de túnel ou proxy (`CF-Connecting-IP`, `X-Forwarded-*`, `Forwarded`, `X-Real-IP`). Pela LAN ou pelo túnel a tela só orienta a abrir o portal no servidor. Depois da primeira conta o endpoint responde 409.
- Papéis: `admin` e `coordenador`. Só o admin vê a aba Usuários e usa `/api/usuarios` (criar e desativar); os demais usam fila e casos.
- Bancos da v1: ao iniciar, a coluna `papel` é criada e `coordenacao` (ou, na falta dela, o usuário de menor id) vira admin.
- `--criar-admin` e `--redefinir-senha` continuam como recuperação; o usuário criado por `--criar-admin` é admin.
- Pendente: o instalador (`instalador.iss`, `instalar-lan-teste.ps1`) ainda cria `coordenacao` na instalação, então a tela de primeiro acesso só aparece se esse passo for removido.
