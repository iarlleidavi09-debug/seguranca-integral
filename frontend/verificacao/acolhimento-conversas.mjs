import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pasta = new URL('./capturas-acolhimento/', import.meta.url);
await mkdir(pasta, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const resultados = [];
try {
  for (const largura of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', error => erros.push(error.message));
    let mensagem = '';
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/acolhimento') {
        mensagem = route.request().postDataJSON().texto;
        return route.fulfill({ json: { codigo: 'K7M2-9QXD' }, status: 201 });
      }
      if (path === '/api/acompanhar') return route.fulfill({ json: {
        status: 'novo', pos_resolucao: false, resolucao: null,
        mensagens: [{ id: 1, autor: 'aluno', texto: mensagem, criado_em: '2026-10-20T18:00:00Z' },
          { id: 2, autor: 'coordenacao', texto: 'Recebemos sua mensagem. Podemos conversar por aqui.', criado_em: '2026-10-20T18:05:00Z' }],
      } });
      return route.fulfill({ json: {}, status: 503 });
    });
    await page.goto('http://127.0.0.1:15173/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByRole('button', { name: 'Conversar sem me identificar' })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`aluno-inicio-${largura}.png`, pasta)), fullPage: true });
    await page.getByRole('button', { name: 'Conversar sem me identificar' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByLabel('Sua primeira mensagem').fill('Quero conversar com alguém.');
    await page.getByRole('button', { name: 'Iniciar conversa anônima' }).click();
    const titulo = page.getByRole('heading', { name: 'Conversa com a coordenação' });
    await expect(titulo).toBeFocused();
    await expect(page.getByText('Código para voltar:', { exact: false })).toContainText('K7M2-9QXD');
    await expect(page.getByText('Uma mensagem nova da coordenação.')).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`aluno-conversa-${largura}.png`, pasta)), fullPage: true });
    await page.getByRole('button', { name: 'Voltar ao início' }).click();
    await expect(page.getByRole('button', { name: 'Abrir caso K7M2-9QXD' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir caso K7M2-9QXD' }).click();
    await expect(titulo).toBeFocused();
    await expect(page.getByText('Uma mensagem nova da coordenação.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Voltar ao início' }).click();
    await page.getByRole('button', { name: 'Apagar acesso K7M2-9QXD' }).click();
    await expect(page.getByRole('heading', { name: 'Continuar meu caso' })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    expect(erros).toEqual([]);
    resultados.push({ largura, acolhimento: true, foco: true, reabertura: true, leitura: true, remocao: true, overflow });
    await context.close();
  }
  for (const largura of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width: largura, height: 900 } });
    const page = await context.newPage();
    let leituras = 0;
    const base = { id: 1, canal: 'acolhimento', tipo: 'outro', prioridade: 'baixa', prioridade_original: 'baixa',
      pontos: 0, status: 'novo', em_andamento: false, anonimo: true, simulacao: false, motivos: [],
      resumo: 'Preciso conversar', criado_em: '2026-10-20T18:00:00Z', atualizado_em: '2026-10-20T18:00:00Z',
      recorrencia_pendente: false, ultimo_acesso_por: null, ultimo_acesso_em: null, conversa_estado: 'mensagem_nova',
      mensagens_novas: 1, ultima_mensagem: { id: 1, autor: 'aluno', texto: 'Gostaria de conversar hoje.', criado_em: '2026-10-20T18:00:00Z' } };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/eu') return route.fulfill({ json: { id: 1, nome: 'Equipe de teste', papel: 'admin' } });
      if (path === '/api/casos') return route.fulfill({ json: { casos: [base, { ...base, id: 2, canal: 'relato', conversa_estado: 'sem_mensagem', mensagens_novas: 0, ultima_mensagem: null }] } });
      if (path === '/api/equipe') return route.fulfill({ json: { usuarios: [] } });
      if (path === '/api/casos/1') return route.fulfill({ json: { ...base, relato: base.resumo, quando: null, onde: null,
        nome: null, turma: null, revisao_estado: 0, ultimo_acesso: null, questionario: null,
        anexos: [], eventos: [], mensagens: [base.ultima_mensagem], notas: [], resolucoes: [], situacoes: [], revisoes_recorrencia: [] } });
      if (path === '/api/casos/1/conversa/lida') { leituras++; return route.fulfill({ json: { ok: true } }); }
      return route.fulfill({ json: {}, status: 503 });
    });
    await page.goto('http://127.0.0.1:15174/coordenacao.html#casos', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByText('Gostaria de conversar hoje.')).toBeVisible();
    await page.locator('.filtros-detalhados summary').click();
    await page.getByLabel('Conversa', { exact: true }).selectOption('mensagem_nova');
    await expect(page.getByRole('button', { name: 'Caso 2. Abrir.' })).toHaveCount(0);
    await page.screenshot({ path: fileURLToPath(new URL(`coord-conversas-${largura}.png`, pasta)), fullPage: true });
    await page.getByRole('button', { name: 'Caso 1. Abrir.' }).click();
    await expect(page.getByRole('tab', { name: 'Conversa', exact: true })).toBeVisible();
    expect(leituras).toBe(0);
    await expect(page.getByRole('link', { name: 'Exportar para o ROE' })).toHaveAttribute('href', '/api/casos/1/exportacao');
    await page.getByRole('tab', { name: 'Conversa', exact: true }).click();
    await expect.poll(() => leituras).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    resultados.push({ largura, coordenacao: true, filtro: true, leituraSomenteConversa: true, exportacao: true });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(new URL('resultado.json', pasta), JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados));
