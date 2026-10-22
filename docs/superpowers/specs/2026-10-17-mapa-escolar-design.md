# Mapa escolar e identificação de turmas

## Escopo aprovado

O usuário aprovou a prévia interativa e o desenho de alas a partir de uma área vazia; pediu o plano e o início da implementação em 17/10/2026. Integrar à aplicação LAN existente, preservando seu visual e os dados existentes. A prévia está em `C:/Users/Pichau/.codex/visualizations/2026/10/17/01a14a9f-496b-7460-be18-06e38463dd33/mapa-escolar.html`.

- Coordenação desenha, move, redimensiona, renomeia e salva ambientes em uma planta inicialmente vazia. Escolas grandes podem separar alas, andares e ambientes por uma hierarquia navegável. Busca local e zoom ajudam a navegação.
- Cada ambiente tem identidade estável; alterações da planta não reatribuem relatos históricos. Ambientes vinculados não podem ser excluídos, mas podem ser renomeados/movidos. Pais com filhos também não podem ser excluídos.
- O aluno informa obrigatoriamente seu ano e sua sala, mesmo no envio sem nome. Sala da turma é distinta do ambiente físico da ocorrência. O nome continua opcional conforme a escolha de identificação. Informar que ano, sala e relato podem permitir reconhecimento.
- Local da ocorrência é selecionável no catálogo; sem planta, fora da escola ou local desconhecido continuam possíveis, sem impedir pedido de ajuda.
- Finalização registra um ou mais autores dos atos identificados na apuração, com nome, ano, sala e foto opcional. Alternativa de autoria não identificada exige justificativa interna. Nomes/fotos/justificativa interna não são enviados ao aluno nem ao agregado do mapa.
- O mapa conta casos, nunca pessoas; filtros por período, base (turma do relator ou autores apurados), ano e sala. Na base autores usar a última resolução do caso; cada caso conta uma vez por ambiente mesmo com múltiplos autores. Simulações ficam fora. Dados antigos sem localização/turma aparecem como sem informação, sem inferir dados.

## Decisões de implementação

Execução sobre o checkout atual: a versão v3 depende de arquivos não commitados; criar checkout a partir de HEAD perderia essa base. Não fazer commits automáticos ou instalar o pacote na escola. Trabalho dividido entre backend, editor e integração dos formulários, com contratos abaixo para evitar conflitos de arquivos.

Planta esquemática de 1200 × 800 unidades por nível, até 500 ambientes e seis níveis. Coordenadas são relativas ao nível do pai. Tipos: `ala`, `andar`, `sala`, `area`. Sem escala métrica ou promessa de planta arquitetônica. Um ambiente não é um cadastro de aluno.

**Complemento do usuário em 17/10/2026:** algumas alas têm formato em L. Além do retângulo, oferecer L com rotação de 0/90/180/270 graus e ajuste da espessura proporcional dos braços. A caixa externa continua usando x/y/largura/altura; o recorte é desenhado por polígono de seis vértices. O formato acompanha salvar/recarregar, mover e redimensionar, sem alterar filhos ou identidade do ambiente. Escolha disponível na criação e na edição, com padrão retangular para dados antigos.

### Contrato HTTP

- Coordenação autenticada: `GET /api/mapa` → `{revisao: number, ambientes: Ambiente[]}`; `POST /api/mapa` recebe o mesmo formato e devolve o estado com revisão incrementada. Revisão antiga → 409, preservando desenho local; autorização, JSON e origem seguem a coordenação existente.
- `Ambiente = {id:string, nome:string, tipo:'ala'|'andar'|'sala'|'area', pai_id:string|null, x:number, y:number, largura:number, altura:number}`. IDs com 1–64 caracteres ASCII alfanuméricos/`_-`; nomes 1–80 caracteres; números finitos; tamanho mínimo 40 e limites 1200 × 800. Pai existente, sem ciclos. Excluir referência de casos → 409. Alterar pai não altera identidade ou localização registrada.
- Campos geométricos opcionais de `Ambiente`: `formato:'retangulo'|'l'`, `rotacao:0|90|180|270`, `espessura:number` entre 0.15 e 0.85 (padrão 0.35). Ausência equivale a retângulo, sem rotação. Persistir geometria em coluna adicional; não expor esse conteúdo no catálogo público. Retângulos legados continuam retornando o contrato anterior sem exigir novos campos.
- Aluno: `GET /api/locais` → `{revisao:number, ambientes: Pick<Ambiente,'id'|'nome'|'tipo'|'pai_id'>[]}`. Apenas catálogo, sem casos, contagens, identidades ou geometria interna.
- Novo envio `POST /api/v4/denuncias` multipart segue v3/deduplicação e exige `ano_relator` (1–40 caracteres), `sala_relator` (1–50); aceita `local_id` opcional (ID existente) e `local_outro` opcional (até 200 caracteres). Esses campos integram resumo canônico de deduplicação. Rotas v2/v3 continuam aceitas para clientes anteriores.
- Detalhe autenticado inclui `ano_relator`, `sala_relator`, `local_id`, `local_nome` (retrato do local) e, nas resoluções, `autoria`, `justificativa_autoria`, `autores: {id,nome,ano,sala,tem_foto}[]`. Campos opcionais nos tipos antigos por compatibilidade.
- Nova finalização `POST /api/v4/casos/<id>/resolucao` multipart: campo `dados` JSON com `{revisao_estado,desfecho,providencias,resultado,autoria,justificativa_autoria,autores}`. `autoria` é `identificada` ou `nao_identificada`. Autores até 10: `{nome,ano,sala,foto_campo?:string}`; arquivos `foto_0` a `foto_9`. Nome até 200; ano até 40; sala até 50; fotos opcionais até 5 MiB, PNG/JPEG/WebP, validadas estruturalmente e gravadas sem metadados pelo sanitizador existente. Justificativa interna obrigatória quando autoria não identificada, 1–2000 caracteres. Sem campos de autores nessa alternativa. Concorrência usa a revisão do caso. Resolução/fotos persistem atomicamente com limpeza de arquivos em falha.
- Foto apenas na coordenação autenticada: `GET /api/casos/<id>/autores/<autor_id>/foto`. Nunca reutilizar rota pública de anexos.
- `GET /api/mapa/resumo?periodo=30&base=relator&ano=&sala=` → `{total:number, sem_local:number, sem_turma:number, sem_autoria:number, ambientes:[{id,total,anos:[{ano,total}],salas:[{ano,sala,total}]}]}`. Período: `7`,`30`,`90`,`todos`; base: `relator`,`autores`. `total` inclui casos filtrados com e sem local; `sem_autoria` conta casos sem autores da última resolução no período antes do filtro de turma. Quantidades são inteiros; nenhum texto de caso/nome/foto/código é retornado. Descendentes são agregados no cliente usando o catálogo, sem contar um caso duas vezes no mesmo ramo.

## Persistência e validação

Migração aditiva/idempotente e backup antes da alteração do banco existente. Preservar códigos, casos, recibos, anexos e resoluções antigas. Fotos internas devem acompanhar o backup existente de uploads. Usar SQLite/transações existentes, sem serviços externos. Atualizar invalidadores após commit e recarregar o mapa ao receber eventos, preservando rascunhos de edição.

## Aceitação

Editor vazio desenha ala, nomeia, move, redimensiona, permite filhos, navega, desfaz e salva/recarrega. Concorrência mostra conflito sem descartar edição. Relato anônimo mantém ano e sala, sem nome, com fallback de catálogo indisponível. Finalização exige campos de autores ou justificativa, preserva formulário em erro e exibe dados somente à equipe. Filtros contam cada caso uma vez, excluem simulação e tratam dados antigos. Testar migração, repetição de envio, autorização e isolamento de fotos. Validar frontend/backend e builds sem executar instalador.

