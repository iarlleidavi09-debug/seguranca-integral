import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pasta = fileURLToPath(new URL('../../backend/app/static/aluno/', import.meta.url));
const capturas = fileURLToPath(new URL('./capturas/', import.meta.url));
const temporaria = fileURLToPath(new URL('../node_modules/.cache/navegador/', import.meta.url));
await mkdir(capturas, { recursive: true });
await mkdir(temporaria, { recursive: true });
const codigo = 'K7M2-9QXD';
let mensagens = [];
const chamadas = [];
const csp = "default-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'";
const servidor = createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  if (req.url.startsWith('/api/')) {
    const partes = [];
    for await (const parte of req) partes.push(parte);
    const corpo = Buffer.concat(partes).toString();
    chamadas.push({ metodo: req.method, url: req.url, corpo });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/denuncias') {
      mensagens = [{ autor: 'coordenacao', texto: 'Mensagem de teste: recebemos seu pedido.', criado_em: '2026-10-14T12:00:00Z' }];
      res.writeHead(201).end(JSON.stringify({ codigo }));
    } else {
      const dados = JSON.parse(corpo);
      if (dados.codigo !== 'K7M29QXD') { res.writeHead(404).end('{"erro":"codigo nao encontrado"}'); return; }
      if (req.url === '/api/acompanhar/mensagens') {
        mensagens.push({ autor: 'aluno', texto: dados.texto, criado_em: '2026-10-14T12:01:00Z' });
        res.writeHead(201).end('{"ok":true}');
      } else res.end(JSON.stringify({ status: 'em_analise', mensagens }));
    }
    return;
  }
  try {
    const caminho = req.url === '/' ? 'index.html' : req.url.slice(1);
    const alvo = path.resolve(pasta, caminho);
    if (!alvo.startsWith(pasta)) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', mime[path.extname(alvo)] ?? 'application/octet-stream');
    res.end(await readFile(alvo));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const origem = `http://127.0.0.1:${servidor.address().port}`;
const resultados = [];
let navegador;
try {
  navegador = await chromium.launch({
    channel: 'chrome', headless: true,
    env: { ...process.env, TEMP: temporaria, TMP: temporaria },
  });
  for (const largura of [375, 768, 1280]) {
    for (const tema of ['light', 'dark']) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema });
      const pagina = await contexto.newPage();
      const erros = [];
      const recursosExternos = [];
      pagina.on('pageerror', erro => erros.push(erro.message));
      pagina.on('console', msg => { if (msg.type() === 'error') erros.push(msg.text()); });
      pagina.on('request', req => { if (!req.url().startsWith(origem) && !req.url().startsWith('blob:')) recursosExternos.push(req.url()); });
      await pagina.addInitScript(() => {
        window.violacoesCsp = [];
        document.addEventListener('securitypolicyviolation', e => window.violacoesCsp.push(e.violatedDirective));
      });
      await pagina.goto(origem);
      async function capturar(tela) {
        await pagina.evaluate(() => document.fonts.ready);
        expect(await pagina.locator('[style]').count()).toBe(0);
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const pequenos = await pagina.locator('button, input, textarea, label.opcao').evaluateAll(elementos => elementos.filter(e => {
          const rect = e.getBoundingClientRect();
          if (!rect.width || e.matches('input[type="radio"],input[type="checkbox"]')) return false;
          return rect.height < 44;
        }).map(e => e.outerHTML));
        expect(pequenos).toEqual([]);
        await pagina.screenshot({ path: path.join(capturas, `${largura}-${tema}-${tela}.png`), fullPage: true });
      }
      await pagina.keyboard.press('Tab');
      await expect(pagina.getByText('Pular para o conteúdo')).toBeFocused();
      await pagina.keyboard.press('Enter');
      await capturar('inicio');
      await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
      await pagina.getByRole('button', { name: 'Continuar' }).click();
      await expect(pagina.getByRole('alert')).toContainText('Escolha');
      await pagina.getByLabel('Ameaça', { exact: true }).check();
      await capturar('tipo');
      await pagina.getByRole('button', { name: 'Continuar' }).click();
      await pagina.getByLabel('O que aconteceu?', { exact: true }).fill('Relato de teste para validar o fluxo do portal.');
      await pagina.getByLabel('Quando aconteceu?').fill('Ontem');
      await pagina.getByLabel('Onde aconteceu?').fill('Aplicativo da turma');
      await pagina.getByLabel('Está acontecendo agora?').check();
      await capturar('relato');
      await pagina.getByRole('button', { name: 'Continuar' }).click();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKn0AAAAASUVORK5CYII=', 'base64');
      await pagina.getByLabel('Adicionar imagens').setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: png });
      await expect(pagina.getByRole('img')).toBeVisible();
      await pagina.getByRole('button', { name: 'Remover teste.png' }).click();
      await pagina.getByLabel('Quero me identificar').check();
      await pagina.getByRole('button', { name: 'Enviar pedido de ajuda' }).click();
      await expect(pagina.getByRole('alert')).toContainText('nome');
      await pagina.getByLabel('Seu nome', { exact: true }).fill('Aluno de teste');
      await pagina.getByLabel('Sua turma').fill('Turma de teste');
      await pagina.getByLabel('Quero ficar anônimo').check();
      await pagina.getByLabel('Adicionar imagens').setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: png });
      await capturar('provas');
      await pagina.getByRole('button', { name: 'Voltar', exact: true }).click();
      await expect(pagina.getByLabel('O que aconteceu?', { exact: true })).toHaveValue('Relato de teste para validar o fluxo do portal.');
      await pagina.getByRole('button', { name: 'Continuar' }).click();
      await pagina.getByRole('button', { name: 'Enviar pedido de ajuda' }).click();
      await expect(pagina.getByText(codigo, { exact: true })).toBeVisible();
      await pagina.getByRole('button', { name: 'Copiar código' }).click();
      await expect(pagina.getByRole('status')).toContainText(/Código copiado|Não foi possível copiar/);
      await capturar('confirmacao');
      expect(await pagina.evaluate(() => localStorage.length)).toBe(0);
      await pagina.getByRole('button', { name: 'Acompanhar meu caso', exact: true }).click();
      await expect(pagina.getByText('Mensagem de teste: recebemos seu pedido.')).toBeVisible();
      await pagina.getByLabel('Sua resposta', { exact: true }).fill('Resposta de teste.');
      await pagina.getByRole('button', { name: 'Enviar resposta' }).click();
      await expect(pagina.getByText('Resposta de teste.', { exact: true })).toBeVisible();
      await pagina.getByRole('button', { name: 'Atualizar conversa' }).click();
      await expect(pagina.getByText('Conversa atualizada.', { exact: true })).toBeVisible();
      await capturar('acompanhar');
      await pagina.getByRole('button', { name: 'Voltar ao início' }).click();
      await pagina.getByLabel('Acompanhar meu caso', { exact: true }).fill(' k7m2 9qxd ');
      await pagina.getByRole('button', { name: 'Acompanhar', exact: true }).click();
      await expect(pagina.getByText('Em análise', { exact: true })).toBeVisible();
      await pagina.getByRole('button', { name: 'Voltar ao início' }).click();
      await pagina.getByLabel('Acompanhar meu caso', { exact: true }).fill('inexistente');
      await pagina.getByRole('button', { name: 'Acompanhar', exact: true }).click();
      await expect(pagina.getByRole('alert')).toHaveText('Não foi possível encontrar o caso. Confira o código e tente de novo.');
      await capturar('erro-codigo');
      expect(await pagina.evaluate(() => window.violacoesCsp)).toEqual([]);
      expect(erros.filter(e => !e.includes('404'))).toEqual([]);
      expect(recursosExternos).toEqual([]);
      resultados.push({ largura, tema, status: 'PASS', telas: 7, csp: 'PASS', recursosExternos: 0, estilosInline: 0, rolagemHorizontal: false });
      console.log(`${largura}px ${tema}: PASS (7 telas, CSP, teclado, anexos, envio e resposta)`);
      await contexto.close();
    }
  }
  expect(chamadas.every(chamada => chamada.metodo === 'POST' && !chamada.url.includes('?') && !chamada.url.includes(codigo))).toBe(true);
  await writeFile(new URL('./resultado.json', import.meta.url), JSON.stringify({ api: 'Simulada, com contrato do brief', resultados }, null, 2));
} finally {
  await navegador?.close();
  await new Promise(resolve => servidor.close(resolve));
}
