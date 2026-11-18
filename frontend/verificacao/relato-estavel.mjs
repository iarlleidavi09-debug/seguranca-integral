import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';

const endereco = process.env.ALUNO_URL ?? 'http://127.0.0.1:5173';
const navegador = await chromium.launch({ channel: 'chrome', headless: true });

try {
  for (const largura of [375, 768, 1280]) {
    await test(`relato sem saltos ou tremedeira em ${largura}px`, async t => {
      const pagina = await navegador.newPage({ viewport: { width: largura, height: 812 } });
      try {
        await pagina.route('**/api/**', rota => rota.fulfill({
          status: rota.request().url().endsWith('/questionario') ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify({ revisao: 1, ambientes: [] }),
        }));
        await pagina.goto(endereco);
        await pagina.getByRole('button', { name: 'Pedir ajuda', exact: true }).click();
        await pagina.getByRole('button', { name: 'Continuar só com o relato' }).click();
        await pagina.getByText('Não foi possível carregar as perguntas agora.', { exact: false }).waitFor();

        await t.test('digitar e apagar mantém o campo e o foco no mesmo lugar', async () => {
          const campo = pagina.getByLabel('O que aconteceu?', { exact: true });
          await campo.click();
          const antes = await campo.boundingBox();
          const texto = 'Preciso conversar sobre o que aconteceu na escola.';
          await pagina.keyboard.type(texto);
          assert.deepEqual(await campo.boundingBox(), antes, 'Digitar deslocou o campo de relato');
          await campo.clear();
          assert.deepEqual(await campo.boundingBox(), antes, 'Apagar deslocou o campo de relato');
          assert.ok(await campo.evaluate(el => el === document.activeElement), 'O campo perdeu o foco');
          await campo.fill(texto);
        });

        await t.test('ponteiro parado na borda mantém os botões estáveis', async () => {
          for (const nome of ['Voltar', 'Continuar']) {
            const botao = pagina.getByRole('button', { name: nome, exact: true });
            await botao.scrollIntoViewIfNeeded();
            await pagina.mouse.move(0, 0);
            const caixa = await botao.boundingBox();
            await pagina.mouse.move(caixa.x + caixa.width - 0.5, caixa.y + caixa.height / 2);
            const posicoes = await botao.evaluate(async el => {
              const amostras = [];
              for (let quadro = 0; quadro < 20; quadro++) {
                await new Promise(requestAnimationFrame);
                const { x, y } = el.getBoundingClientRect();
                amostras.push(`${x},${y}`);
              }
              return amostras;
            });
            assert.equal(new Set(posicoes).size, 1, `${nome} treme com o ponteiro parado`);
          }
        });

        await t.test('avança e volta preservando o relato', async () => {
          await pagina.getByLabel('Seu ano', { exact: true }).fill('8º ano');
          await pagina.getByLabel('Sua sala', { exact: true }).fill('B');
          await pagina.getByRole('button', { name: 'Continuar', exact: true }).click();
          await pagina.getByRole('heading', { name: 'Revise seu pedido', exact: true }).waitFor();
          await pagina.getByRole('button', { name: 'Editar relato', exact: true }).click();
          assert.equal(await pagina.getByLabel('O que aconteceu?', { exact: true }).inputValue(),
            'Preciso conversar sobre o que aconteceu na escola.');
        });
      } finally {
        await pagina.close();
      }
    });
  }
} finally {
  await navegador.close();
}
