# Primeiro acesso e papéis da coordenação

- Enquanto o banco não tem nenhum usuário, o portal da coordenação (porta 4000) abre na tela **Criar conta de administrador** em vez do login.
- A criação só é aceita **na máquina do servidor** (`127.0.0.1`/`::1`) e só quando o pedido não traz cabeçalhos de túnel ou proxy (`CF-Connecting-IP`, `X-Forwarded-*`, `Forwarded`, `X-Real-IP`). Pela LAN ou pelo túnel a tela só orienta a abrir o portal no servidor. Depois da primeira conta o endpoint responde 409.
- Papéis: `admin` e `coordenador`. Só o admin vê a aba Usuários e usa `/api/usuarios` (criar e desativar); os demais usam fila e casos.
- Bancos da v1: ao iniciar, a coluna `papel` é criada e `coordenacao` (ou, na falta dela, o usuário de menor id) vira admin.
- `--criar-admin` e `--redefinir-senha` continuam como recuperação; o usuário criado por `--criar-admin` é admin.
- O instalador (`instalador.iss`) e o `instalar-lan-teste.ps1` não criam mais a conta `coordenacao` nem mostram senha: a conta nasce no primeiro acesso, aberto em `http://127.0.0.1:4000` no próprio servidor.
- O **primeiro admin** (administrador de menor id, o criado no primeiro acesso) é o único que pode usar a **Zona de risco**, cartão no fim da tela Usuários que apaga todos os dados de uso.
- O cartão só existe em implantação secundária, com `"implantacao_secundaria": true` no `config.json`; exige senha e a frase `APAGAR TUDO`, e preserva usuários e mapa.
- Outro admin ou um coordenador não vê o cartão (403). Detalhes e avisos em `docs/operacao-lan.md`, seção "Implantação secundária: limpar todos os dados".
