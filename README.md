# TETRAGUARD

Canal escolar de pedidos de ajuda e acompanhamento contra cyberbullying e outras situações de violência. O aluno relata o que viveu ou viu, com anonimato por padrão. A coordenação acolhe, investiga, conversa, registra providências e acompanha recorrências.

> Projeto em desenvolvimento para uso em uma única escola. Os dados da demonstração são fictícios.

## O que o sistema faz

**Portal do aluno** (celular e desktop, visual neobrutalista em creme, coral e limão, com tema escuro)
- Pedido de ajuda em passos: situação, perguntas opcionais e adaptativas, relato, anexos de imagem e revisão.
- Código de acompanhamento para ver o andamento e conversar com a coordenação, sem informar o nome.
- Orientação imediata enquanto espera: passos práticos conforme as situações marcadas e contatos de apoio da escola, quando configurados.
- Rascunho de 24 horas e aviso de privacidade em cada etapa.

**Portal da coordenação** (identidade verde, tema claro e escuro)
- Visão geral, fila de casos por prioridade, meu atendimento e pós-resolução.
- Detalhe do caso: conversa com o aluno, notas internas, histórico, reavaliação justificada e resolução.
- Mapa escolar e relatórios com exportação em CSV e PDF.
- Padrões observados: avisa quando relatos se repetem no mesmo local e horário, sem expor texto nem identidade (mínimo de 3 casos).
- Trilha de evidências: hash SHA-256 e carimbo dos anexos, registro imutável de acessos e dossiê do caso em PDF (registro de integridade, não prova legal).
- Alertas por e-mail para casos críticos, com mensagem sem dados pessoais, ativados apenas quando o SMTP está configurado.
- Atualização automática, papéis de administrador e coordenador.

## Princípios

- Anonimato por padrão. O código do caso só trafega em POST, nunca em URL.
- Triagem por regras fixas e revisáveis, sem IA decidindo.
- Separação entre a conversa visível ao aluno e as notas internas.
- Nenhuma notificação, padrão ou exportação carrega o texto do relato do aluno.

## Tecnologia

- Backend: Python 3.12, Flask, gevent, SQLite.
- Frontend: React 19, TypeScript, Vite 7 (dois portais com build próprio).
- Testes: pytest e Vitest; verificação de contraste de cores em `frontend/verificacao/contraste.mjs`.
- Empacotamento do servidor para Windows: PyInstaller e Inno Setup (pasta `installer/`).

## Como rodar em desenvolvimento

Requisitos: Python 3.12 e Node recente (Vite 7 exige Node 20.19 ou superior).

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Linux/Mac: .venv/bin/python
.venv/Scripts/python entrada.py

# frontend (em outro terminal)
cd frontend
npm install
npm run dev          # portal do aluno
npm run dev:coord    # portal da coordenação
```

Por padrão o portal do aluno usa a porta 3000 e a coordenação a porta 4000. No primeiro acesso, a coordenação pede a criação do administrador, e isso só é possível na própria máquina do servidor.

## Testes

```bash
cd backend && .venv/Scripts/python -m pytest -q
cd frontend && npm test
cd frontend && node verificacao/contraste.mjs
```

## Configuração e segredos

A configuração fica em um `config.json` na pasta de dados do servidor, fora do repositório. Chaves de sessão são geradas na instalação e nunca versionadas. Credenciais de e-mail (SMTP) e contatos de apoio da escola também ficam nessa configuração. Os arquivos `.env`, bancos de dados e cópias de segurança estão no `.gitignore`.

## Documentação

- Produto e contexto: [`PRODUCT.md`](PRODUCT.md) e [`DESIGN.md`](DESIGN.md).
- Especificações e planos: [`docs/superpowers/`](docs/superpowers).
- Operação anterior em rede local (histórico): [`docs/operacao-lan.md`](docs/operacao-lan.md).

## Direitos autorais

Copyright (c) 2026 Iarlle Davi. Todos os direitos reservados. O código é publicado para consulta e avaliação, sem licença de uso, cópia ou distribuição. Veja [`LICENSE`](LICENSE).
