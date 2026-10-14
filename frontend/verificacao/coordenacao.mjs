// Percorre o portal da coordenação em navegador real.
// Uso: SI_COORD_URL=http://127.0.0.1:PORTA SI_COORD_SENHA=... node verificacao/coordenacao.mjs
// O servidor precisa estar no ar com a CSP do portal e um usuário "Marina".
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origem = process.env.SI_COORD_URL;
const senha = process.env.SI_COORD_SENHA;
if (!origem || !senha) throw new Error('Defina SI_COORD_URL e SI_COORD_SENHA.');
const capturas = fileURLToPath(new URL('./capturas/', import.meta.url));
const temporaria = fileURLToPath(new URL('../node_modules/.cache/navegador/', import.meta.url));
await mkdir(capturas, { recursive: true });
await mkdir(temporaria, { recursive: true });

const resultados = [];
const navegador = await chromium.launch({ channel: 'chrome', headless: true, env: { ...process.env, TEMP: temporaria, TMP: temporaria } });
try {
  for (const largura of [375, 768, 1280]) {
    for (const tema of ['light', 'dark']) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema });
      await contexto.addInitScript(() => {
        window.__violacoes = [];
        document.addEventListener('securitypolicyviolation', e => window.__violacoes.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const pagina = await contexto.newPage();
      const erros = [];
      pagina.on('console', m => { if (m.type() === 'error' || /content security policy/i.test(m.text())) erros.push(m.text()); });
      pagina.on('pageerror', e => erros.push(String(e)));
      const nome = `${largura}-${tema}`;
      const foto = async (parte) => { if (process.env.SI_FOTOS?.split(',').includes(parte)) await pagina.screenshot({ path: `${capturas}coord-${nome}-${parte}.png`, fullPage: true }); };
      const passos = [];
      const ok = async (descricao, teste) => { await teste(); passos.push(descricao); };

      await pagina.goto(`${origem}/`);
      await ok('login aparece sem sessão', async () => {
        await pagina.getByRole('heading', { name: 'Portal da coordenação' }).waitFor();
        if (await pagina.getByRole('navigation').count()) throw new Error('navegação visível sem sessão');
      });
      await foto('login');
      await pagina.getByLabel('Nome').fill('Marina');
      await pagina.getByLabel('Senha').fill('senha errada qualquer');
      await pagina.getByRole('button', { name: 'Entrar' }).click();
      await ok('falha de login mostra a mensagem única', () => pagina.getByRole('alert').filter({ hasText: 'Nome ou senha incorretos.' }).waitFor());
      await pagina.getByLabel('Senha').fill(senha);
      await pagina.getByRole('button', { name: 'Entrar' }).click();
      await ok('fila abre depois do login', () => pagina.getByRole('heading', { name: 'Fila de casos' }).waitFor());
      await pagina.getByText('Estão me ameaçando').first().waitFor();
      await ok('primeiro item da fila é gravidade alta', async () => {
        const primeiro = pagina.locator('.fila-item').first();
        if ((await primeiro.getAttribute('data-gravidade')) !== 'alta') throw new Error('o topo não é alta');
      });
      await ok('selo simulação presente', async () => { if (!(await pagina.locator('.selo-simulacao').count())) throw new Error('sem selo'); });
      await foto('fila');
      await pagina.getByLabel('Status').selectOption('resolvido');
      await ok('filtro sem resultados', () => pagina.getByText('Nenhum caso com esses filtros.').waitFor());
      await pagina.getByRole('button', { name: 'Limpar filtros' }).click();
      await pagina.locator('.fila-item').first().waitFor();

      await pagina.locator('.fila-linha', { hasText: 'Estão me ameaçando' }).first().click();
      await ok('caso abre com o título em foco', async () => {
        await pagina.getByRole('heading', { name: /Caso \d+: Ameaça/ }).waitFor();
        await pagina.waitForFunction(() => document.activeElement?.tagName === 'H1');
      });
      await ok('hash tem só o número', async () => { if (!/#caso-\d+$/.test(pagina.url())) throw new Error(pagina.url()); });
      await ok('miniatura do anexo carregou', async () => {
        await pagina.waitForFunction(() => { const i = document.querySelector('.miniatura img'); return i && i.complete && i.naturalWidth > 0; });
      });
      await foto('caso');
      await pagina.getByRole('button', { name: 'Ampliar anexo 1' }).click();
      await ok('anexo ampliado', () => pagina.getByRole('dialog').waitFor());
      await foto('anexo');
      await pagina.keyboard.press('Escape');
      await pagina.getByLabel('Status').selectOption('em_analise');
      await ok('status muda e a linha do tempo atualiza', () => pagina.getByText(/Status mudou de Novo para Em análise/).first().waitFor());
      await pagina.getByLabel('Gravidade').selectOption('media');
      await ok('gravidade muda', () => pagina.getByText(/Gravidade mudou de Alta para Média/).first().waitFor());
      await pagina.getByLabel('Mensagem ao aluno').fill('Recebemos o seu pedido. Vamos conversar com cuidado.');
      await pagina.getByRole('button', { name: 'Enviar ao aluno' }).click();
      await ok('mensagem ao aluno enviada', () => pagina.locator('.mensagem p', { hasText: 'Recebemos o seu pedido.' }).first().waitFor());
      await pagina.getByRole('tab', { name: 'Notas internas' }).click();
      await pagina.getByLabel('Nota interna').fill('Falar com a família amanhã.');
      await pagina.getByRole('button', { name: 'Salvar nota' }).click();
      await ok('nota interna salva e separada', async () => {
        await pagina.locator('.mensagem p', { hasText: 'Falar com a família amanhã.' }).first().waitFor();
        if (await pagina.locator('.mensagem p', { hasText: 'Recebemos o seu pedido.' }).count()) throw new Error('mensagem misturada nas notas');
      });
      await foto('notas');
      // devolve o caso ao estado inicial para a próxima rodada
      await pagina.getByLabel('Status').selectOption('novo');
      await pagina.getByLabel('Gravidade').selectOption('alta');
      await pagina.getByText(/Gravidade mudou de Média para Alta/).first().waitFor();

      await pagina.getByRole('button', { name: 'Usuários' }).click();
      await ok('usuários lista a própria conta sem desativar', async () => {
        await pagina.getByText('Você não pode desativar a própria conta.').waitFor();
      });
      await foto('usuarios');
      await pagina.getByRole('button', { name: 'Ensaio' }).click();
      await pagina.getByRole('button', { name: 'Carregar casos de simulação' }).click();
      await ok('ensaio responde', () => pagina.getByRole('status').filter({ hasText: /caso|simulação/ }).first().waitFor());
      await pagina.getByRole('button', { name: 'Remover simulação' }).click();
      await ok('remoção pede confirmação', () => pagina.getByRole('button', { name: 'Confirmar remoção' }).waitFor());
      await foto('ensaio');
      await pagina.getByRole('button', { name: 'Cancelar' }).click();

      const horizontal = await pagina.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      const estilos = await pagina.evaluate(() => document.querySelectorAll('[style]').length);
      const violacoes = await pagina.evaluate(() => window.__violacoes);
      await pagina.getByRole('button', { name: 'Sair' }).click();
      await ok('sair volta ao login', () => pagina.getByLabel('Senha').waitFor());
      resultados.push({ nome, passos: passos.length, rolagemHorizontal: horizontal, elementosComStyle: estilos, violacoesCsp: violacoes, errosConsole: erros });
      await contexto.close();
    }
  }
} finally { await navegador.close(); }
await writeFile(fileURLToPath(new URL('./resultado-coord.json', import.meta.url)), JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados, null, 2));
