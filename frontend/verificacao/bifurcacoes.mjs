import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.ALUNO_URL || 'http://127.0.0.1:53160';
const saida = path.resolve('../.superpowers/sdd/2026-10-17-bifurcacoes/navegador');
await mkdir(saida, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on('pageerror', e => erros.push(e.message));
const resultados = [];
async function chegar(q, direcao = 'Continuar') {
  for (let n = 0; n < 30; n++) {
    if (await page.locator(`input[name="${q}"]`).count()) return;
    await page.getByRole('button', { name: direcao, exact: true }).click();
  }
  throw new Error(`Pergunta não alcançada: ${q}`);
}
try {
  const response = await page.request.get(`${base}/api/v3/questionario`);
  expect(response.ok()).toBeTruthy();
  const def = await response.json();
  const opcao = def.grupos.flatMap(g => g.opcoes).find(o => o.id === 'cyber');
  const grupo = def.grupos.find(g => g.opcoes.some(o => o.id === 'cyber'));
  const resposta = (q, id) => page.getByLabel(def.perguntas.find(p => p.id === q).respostas.find(r => r.id === `${q}.${id}`).texto, { exact: true });
  await page.goto(base);
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Pedir ajuda', exact: true }).click();
  await page.locator('summary').filter({ hasText: grupo.nome }).click();
  await page.getByRole('checkbox', { name: opcao.texto, exact: true }).check();
  await chegar('q-cyber-forma');
  await expect(page.getByText(`Sobre: ${opcao.texto}`, { exact: true })).toBeVisible();
  await resposta('q-cyber-forma', 'imagens').check();
  await chegar('q-cyber-imagens');
  await resposta('q-cyber-imagens', 'publicadas').check();
  await chegar('q-cyber-imagens-circulacao');
  await page.locator('input[name="q-cyber-imagens-circulacao"]').first().check();
  await page.screenshot({ path: path.join(saida, 'cyber-imagens.png'), fullPage: true });
  resultados.push('Cyberbullying: imagens → publicação → circulação (condição AND) no Chrome.');
  await chegar('q-cyber-forma', 'Voltar');
  await resposta('q-cyber-forma', 'imagens').uncheck();
  await resposta('q-cyber-forma', 'boatos').check();
  const rascunho = await page.evaluate(() => JSON.parse(localStorage.getItem('si-aluno-pedido-v3')));
  expect(JSON.stringify(rascunho)).not.toContain('q-cyber-imagens.publicadas');
  expect(JSON.stringify(rascunho)).not.toContain('q-cyber-imagens-circulacao');
  await chegar('q-cyber-boatos');
  await page.locator('input[name="q-cyber-boatos"]').first().check();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(`Sobre: ${opcao.texto}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(saida, 'cyber-boatos-mobile.png'), fullPage: true });
  resultados.push('Troca para boatos remove imagens e descendentes do rascunho; tela móvel sem overflow.');
  await page.getByRole('button', { name: 'Ir para o relato', exact: true }).click();
  await page.getByLabel('O que aconteceu?', { exact: true }).fill('Relato fictício de boatos em mensagens para validar o questionário.');
  await page.getByLabel('Seu ano', { exact: true }).fill('8º ano');
  await page.getByLabel('Sua sala', { exact: true }).fill('B');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const envio = page.waitForResponse(r => r.url() === `${base}/api/v4/denuncias` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enviar pedido de ajuda', exact: true }).click();
  const enviado = await envio;
  expect(enviado.status(), await enviado.text()).toBe(201);
  const corpo = enviado.request().postData();
  expect(corpo).toContain('q-cyber-forma.boatos');
  expect(corpo).not.toContain('q-cyber-imagens');
  resultados.push('Envio v4 aceito com ano/sala e somente respostas do caminho atual; perguntas não respondidas opcionais.');
  expect(erros).toEqual([]);
  await writeFile(path.join(saida, 'resultado.json'), JSON.stringify({ resultados, erros }, null, 2));
  console.log(resultados.join('\n'));
} finally {
  await browser.close();
}
