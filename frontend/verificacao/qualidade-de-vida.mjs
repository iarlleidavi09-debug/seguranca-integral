import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pasta = path.resolve('verificacao/qualidade-de-vida');
await mkdir(pasta, { recursive: true });
const aluno = process.argv.includes('--aluno');
const raiz = path.resolve(`../backend/app/static/${aluno ? 'aluno' : 'coordenacao'}`);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const servidor = createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://localhost').pathname;
  const alvo = path.resolve(raiz, caminho === '/' ? 'index.html' : `.${caminho}`);
  if (!alvo.startsWith(raiz + path.sep)) { res.writeHead(404).end(); return; }
  try { res.setHeader('Content-Type', tipos[path.extname(alvo)] ?? 'application/octet-stream'); res.end(await readFile(alvo)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const porta = servidor.address().port;
const navegador = await chromium.launch({ channel: 'chrome', headless: true });
const questionario = JSON.parse(await readFile('../backend/app/questionario_v3.json', 'utf8'));
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const criado = '2026-11-01T12:00:00+00:00';
const casos = [5, 6].map((id, i) => ({
  id, tipo: 'ameaca', prioridade: i ? 'media' : 'alta', prioridade_original: i ? 'media' : 'alta', pontos: 3,
  status: 'em_investigacao', revisao_estado: 0, em_andamento: false, anonimo: true, simulacao: false,
  resumo: i ? 'Acompanhamento após conversa com a turma.' : 'Um aluno pediu ajuda sobre a convivência no intervalo.',
  relato: 'O aluno relatou uma situação de intimidação durante o intervalo. A equipe está acompanhando.',
  motivos: ['tipo: ameaca'], recorrencia_pendente: false, ultimo_acesso_por: 'Marina', ultimo_acesso_em: criado,
  criado_em: criado, atualizado_em: criado, responsavel: { id: 1, nome: 'Marina', ativo: true },
  proxima_acao: 'Conversar com o aluno no intervalo', prazo_acao: hoje, conversa_estado: 'aguardando_equipe', mensagens_novas: 1,
  codigo_acompanhamento: i ? 'ABCD-EFGH' : 'K7M2-9QXD', nome: null, turma: null, quando: 'Ontem', onde: 'Pátio',
  ano_relator: '8º ano', sala_relator: 'B', ultimo_acesso: null, questionario: null,
  anexos: [], eventos: [], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [],
  mensagens: [{ id: 1, autor: 'aluno', texto: 'Obrigado por me ouvirem. Podemos conversar no intervalo?', criado_em: criado, usuario: null, usuario_id: null }],
}));
const pagina = await navegador.newPage();
pagina.setDefaultTimeout(60000);
const erros = [];
let anexosAluno = 0;
pagina.on('pageerror', e => { erros.push(e.message); console.error('Erro no navegador:', e.message); });
await pagina.route('**/api/**', async rota => {
  const url = new URL(rota.request().url());
  let dados = {};
  if (url.pathname === '/api/eu') dados = { id: 1, nome: 'Marina', papel: 'admin' };
  else if (url.pathname === '/api/acompanhar') dados = { status: 'em_investigacao', mensagens: [{ id: 1, autor: 'coordenacao', texto: 'Recebemos seu pedido. Como você está hoje?', criado_em: criado }], resolucao: null, pos_resolucao: false, ultima_situacao: null, anexos_total: anexosAluno };
  else if (url.pathname === '/api/acompanhar/anexos') { anexosAluno++; dados = { anexos_adicionados: 1, anexos_total: anexosAluno, anexos_recusados: [] }; }
  else if (url.pathname === '/api/casos') dados = { casos };
  else if (/^\/api\/casos\/\d+$/.test(url.pathname)) dados = casos.find(c => c.id === Number(url.pathname.split('/').at(-1)));
  else if (url.pathname === '/api/resumo') dados = { status: { novo: 0, em_investigacao: 2, resolvido: 0 }, prioridade: { critica: 0, alta: 1, media: 1, baixa: 0 }, recorrencia_pendente: 0 };
  else if (url.pathname === '/api/v3/questionario') dados = questionario;
  else if (url.pathname === '/api/equipe') dados = { usuarios: [{ id: 1, nome: 'Marina' }] };
  else if (/\/presenca$/.test(url.pathname)) dados = { pessoas: [] };
  else if (/eventos$/.test(url.pathname)) { await rota.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return; }
  await rota.fulfill({ contentType: 'application/json', body: JSON.stringify(dados ?? {}) });
});
try {
  if (aluno) {
    await pagina.setViewportSize({ width: 375, height: 900 });
    await pagina.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' });
    const consultar = async () => {
      await pagina.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Acompanhar', exact: true }).click();
      await pagina.getByLabel('Código de acompanhamento', { exact: true }).fill('K7M2-9QXD');
      await pagina.locator('main').getByRole('button', { name: 'Acompanhar', exact: true }).click();
      await expect(pagina.getByRole('heading', { name: 'Conversa com a coordenação', exact: true })).toBeVisible();
    };
    await consultar();
    await expect(pagina.locator('.codigo-acompanhamento')).toContainText('K7M2-9QXD');
    await pagina.getByText('Adicionar imagens', { exact: true }).click();
    await pagina.getByLabel('Selecionar imagens', { exact: true }).setInputFiles({ name: 'imagem.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=', 'base64') });
    await pagina.getByRole('button', { name: 'Enviar imagens', exact: true }).click();
    await expect(pagina.getByText('1 imagem enviada para a coordenação.', { exact: true })).toBeVisible();
    await pagina.getByLabel('Sua resposta', { exact: true }).fill('Gostaria de conversar no intervalo.');
    await pagina.screenshot({ path: path.join(pasta, 'aluno-375.png'), fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await pagina.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Início', exact: true }).click();
    await consultar();
    await expect(pagina.getByLabel('Sua resposta', { exact: true })).toHaveValue('Gostaria de conversar no intervalo.');
    await pagina.setViewportSize({ width: 1280, height: 950 });
    await pagina.screenshot({ path: path.join(pasta, 'aluno-desktop.png'), fullPage: true });
    expect(erros).toEqual([]);
    await writeFile(path.join(pasta, 'resultado-aluno.json'), JSON.stringify({ erros, verificacoes: ['código visível', 'anexo no caso existente', 'rascunho ao sair e voltar', 'mobile sem overflow'] }, null, 2));
    console.log('Navegador aluno: código, anexos, rascunho e responsividade verificados.');
  } else {
  await pagina.setViewportSize({ width: 1440, height: 1000 });
  await pagina.goto(`http://127.0.0.1:${porta}/#atendimento`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(pagina.getByRole('button', { name: 'Caso 5. Abrir.', exact: true })).toBeVisible();
  await pagina.getByText('Filtros favoritos', { exact: true }).click();
  await pagina.getByLabel('Nome do filtro favorito').fill('Meu acompanhamento');
  await pagina.getByRole('button', { name: 'Salvar filtro favorito', exact: true }).click();
  await expect(pagina.getByRole('button', { name: 'Aplicar Meu acompanhamento', exact: true })).toBeVisible();
  console.log('Favorito criado.');
  await pagina.screenshot({ path: path.join(pasta, 'fila-desktop.png'), fullPage: true });
  await pagina.getByRole('button', { name: 'Caso 5. Abrir.', exact: true }).click();
  await expect(pagina.getByText('K7M2-9QXD', { exact: true })).toBeVisible();
  console.log('Código do caso visível.');
  await pagina.screenshot({ path: path.join(pasta, 'caso-cabecalho-desktop.png'), fullPage: true });
  await pagina.getByRole('tab', { name: 'Conversa', exact: true }).click();
  await pagina.getByLabel('Mensagem ao aluno', { exact: true }).fill('Podemos conversar amanhã.');
  await pagina.getByText('Modelos de resposta', { exact: true }).click();
  await pagina.getByLabel('Modelo de resposta', { exact: true }).selectOption('acolhimento');
  await pagina.screenshot({ path: path.join(pasta, 'caso-desktop.png'), fullPage: true });
  await pagina.getByRole('button', { name: 'Próximo caso', exact: true }).click();
  await expect(pagina.getByText('ABCD-EFGH', { exact: true })).toBeVisible();
  await pagina.getByRole('button', { name: 'Caso anterior', exact: true }).click();
  await pagina.getByRole('tab', { name: 'Conversa', exact: true }).click();
  await expect(pagina.getByLabel('Mensagem ao aluno', { exact: true })).toHaveValue('Podemos conversar amanhã.');
  await pagina.getByRole('button', { name: 'Voltar aos casos', exact: true }).click();
  await expect(pagina.getByRole('heading', { name: 'Meu atendimento', exact: true })).toBeVisible();
  for (const largura of [375, 768]) {
    await pagina.setViewportSize({ width: largura, height: 900 });
    await pagina.screenshot({ path: path.join(pasta, `fila-${largura}.png`), fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await pagina.getByRole('button', { name: 'Caso 5. Abrir.', exact: true }).click();
    await pagina.getByRole('tab', { name: 'Conversa', exact: true }).click();
    await pagina.screenshot({ path: path.join(pasta, `caso-${largura}.png`), fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await pagina.getByRole('button', { name: 'Voltar aos casos', exact: true }).click();
  }
  expect(erros).toEqual([]);
  await writeFile(path.join(pasta, 'resultado.json'), JSON.stringify({ erros, verificacoes: ['favoritos', 'código relacionado', 'anterior/próximo', 'rascunho por caso', 'retorno à origem', 'sem overflow 375/768px'] }, null, 2));
  console.log('Navegador: favoritos, código, rascunho, navegação e responsividade verificados.');
  }
} finally { await navegador.close(); await new Promise(resolve => servidor.close(resolve)); }
