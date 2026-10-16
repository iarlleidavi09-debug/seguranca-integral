// Percorre o portal do aluno em Chrome real contra um servidor de verdade e confere a triagem.
// Uso (servidor de teste já no ar, com pasta de dados temporária e limites de taxa desligados):
//   SI_COORD_URL=http://127.0.0.1:14000 SI_ALUNO_URL=http://127.0.0.1:13000 \
//   SI_ADMIN_NOME=Admin SI_COORD_SENHA=... node verificacao/aluno.mjs
// Opcional: SI_LARGURAS=375,768 SI_TEMAS=light SI_TRIAGEM=0 (padrão: tudo).
// Percursos: (A) Ameaças com salto e volta, (B) Cyberbullying com troca de situação, (C) rascunho,
// (D) definição indisponível (503 por interceptação), (E) definição que nunca responde.
// O administrador de teste é criado pela API de primeiro acesso, se o banco estiver sem contas.
// A coordenação é operada pela API (sessão do administrador de teste); nada secreto é impresso.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { perguntasVisiveis, montarEnvio } from '../src/aluno/fluxo.ts';

const coord = process.env.SI_COORD_URL;
const aluno = process.env.SI_ALUNO_URL;
const senha = process.env.SI_COORD_SENHA;
const nomeAdmin = process.env.SI_ADMIN_NOME ?? 'Admin Teste';
if (!coord || !aluno || !senha) throw new Error('Defina SI_COORD_URL, SI_ALUNO_URL e SI_COORD_SENHA.');
const larguras = (process.env.SI_LARGURAS ?? '375,768,900,1024,1280').split(',').map(Number);
const temas = (process.env.SI_TEMAS ?? 'light,dark').split(',');
const capturas = fileURLToPath(new URL('./capturas/', import.meta.url));
const temporaria = fileURLToPath(new URL('../node_modules/.cache/navegador/', import.meta.url));
await mkdir(capturas, { recursive: true });
await mkdir(temporaria, { recursive: true });

// ---- API da coordenação (cookie de sessão guardado à mão)
let cookie = '';
async function api(metodo, caminho, corpo) {
  const r = await fetch(`${coord}${caminho}`, {
    method: metodo,
    headers: { ...(metodo === 'GET' ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  });
  const novo = r.headers.getSetCookie?.() ?? [];
  if (novo.length) cookie = novo.map(c => c.split(';')[0]).join('; ');
  const texto = await r.text();
  let dados = null; try { dados = JSON.parse(texto); } catch { /* corpo vazio */ }
  if (!r.ok) throw new Error(`${metodo} ${caminho.split('?')[0]} ${r.status}`);
  return dados;
}
async function entrarNaCoordenacao() {
  const estado = await api('GET', '/api/setup');
  if (estado.pendente) await api('POST', '/api/setup', { nome: nomeAdmin, senha });
  else await api('POST', '/api/login', { nome: nomeAdmin, senha });
}
const achar = async (marca) => (await api('GET', `/api/casos?q=${encodeURIComponent(marca)}`)).casos[0];

// ---- PNG de teste (largura x altura diferentes, para o "Girar" ser visível)
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pedaco(tipo, dados) {
  const t = Buffer.concat([Buffer.from(tipo), dados]);
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(t));
  return Buffer.concat([len, t, sum]);
}
function png(w, h) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const l = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) { l[1 + x * 3] = (x * 255 / w) | 0; l[2 + x * 3] = (y * 255 / h) | 0; l[3 + x * 3] = 120; }
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(Buffer.concat(linhas))), pedaco('IEND', Buffer.alloc(0))]);
}
const imagem = png(160, 80);

// definição real do questionário, lida do servidor de teste (só para escolher respostas e montar a triagem)
const def = await (await fetch(`${aluno}/api/questionario`)).json();
const textoResposta = Object.fromEntries(def.perguntas.flatMap(p => p.respostas.map(r => [r.id, r.texto])));
const textoOpcao = Object.fromEntries(def.situacoes.flatMap(s => s.opcoes.map(o => [o.id, o.texto])));
const primeiraResposta = (id) => def.perguntas.find(p => p.id === id).respostas[0].id;
// campos do multipart enviado pelo navegador
const respostasDoEnvio = (corpo) => { const m = /name="respostas"\r\n\r\n([^\r]*)\r\n/.exec(corpo ?? ''); return m ? JSON.parse(m[1]) : null; };
const relatoDoEnvio = (corpo) => (/name="relato"\r\n\r\n([^\r]*)\r\n/.exec(corpo ?? '') ?? [])[1] ?? null;

const rodada = Date.now().toString(36).slice(-4);
const resultados = [];
const casosVerificados = [];
await entrarNaCoordenacao();
const navegador = await chromium.launch({ channel: 'chrome', headless: true, env: { ...process.env, TEMP: temporaria, TMP: temporaria } });
try {
  for (const largura of larguras) {
    for (const tema of temas) {
      const nome = `${largura}-${tema}`;
      const marca = `zz${rodada}${largura}${tema[0]}`;
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema, permissions: ['clipboard-read', 'clipboard-write'] });
      const violacoes = [];
      await contexto.exposeFunction('__relatarViolacao', (v) => violacoes.push(v));
      await contexto.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', e => window.__relatarViolacao(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const pagina = await contexto.newPage();
      const erros = [];
      const problemas = [];
      const passos = [];
      const respostasRuins = [];
      const envios = [];
      // o corpo multipart com arquivos só aparece na interceptação; o pedido segue sem alteração
      await pagina.route('**/api/denuncias', async rota => { envios.push(rota.request().postDataBuffer()?.toString('utf8') ?? ''); await rota.continue(); });
      pagina.on('response', r => { if (r.status() >= 400) respostasRuins.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      pagina.on('console', m => {
        const falhaDeRecurso = /^Failed to load resource/.test(m.text());
        if ((m.type() === 'error' && !falhaDeRecurso) || /content security policy/i.test(m.text())) erros.push(m.text());
      });
      pagina.on('pageerror', e => erros.push(String(e)));
      const ok = async (descricao, teste) => {
        try { await teste(); passos.push(descricao); }
        catch (e) { problemas.push(`${descricao}: ${String(e.message ?? e).split('\n')[0]}`); }
      };
      const foto = async (parte) => pagina.screenshot({ path: `${capturas}aluno-${nome}-${parte}.png`, fullPage: true });
      let maiorExcesso = 0;
      const medir = async (onde) => {
        const m = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: innerWidth }));
        maiorExcesso = Math.max(maiorExcesso, m.s - m.w);
        if (m.s > m.w) problemas.push(`rolagem horizontal em ${onde}: ${m.s} > ${m.w}`);
      };
      // texto cortado: overflow oculto ou reticências com conteúdo maior que a caixa; também filhos que passam da janela
      const cortes = async (onde) => {
        const lista = await pagina.evaluate(() => {
          const achados = [...document.querySelectorAll('body *')].filter(e => {
            const c = getComputedStyle(e);
            if (!e.textContent?.trim() || e.matches('.pular, .so-leitor')) return false;
            return (c.overflowX === 'hidden' || c.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1;
          }).map(e => `corte ${e.tagName.toLowerCase()}.${e.className}`);
          const fora = [...document.querySelectorAll('.aluno-app *')].filter(e => {
            if (e.matches('.pular') || e.closest('.pular')) return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
          }).map(e => `fora da janela ${e.tagName.toLowerCase()}.${e.className}`);
          return [...achados, ...fora].slice(0, 6);
        });
        if (lista.length) problemas.push(`texto cortado em ${onde}: ${lista.join(', ')}`);
      };
      const foco = async (onde, n = 8) => {
        await pagina.evaluate(() => document.activeElement?.blur());
        const semAnel = [];
        for (let i = 0; i < n; i++) {
          await pagina.keyboard.press('Tab');
          const r = await pagina.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return null;
            const c = getComputedStyle(e);
            const a = getComputedStyle(e, '::after');
            const visivel = (x) => x.outlineStyle !== 'none' && parseFloat(x.outlineWidth) > 0;
            // rádio e caixa de seleção: o anel pode ficar no rótulo vizinho
            const rotulo = e.closest('label');
            const noRotulo = rotulo ? (visivel(getComputedStyle(rotulo)) || getComputedStyle(rotulo).boxShadow !== 'none') : false;
            return { rotulo: `${e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') || e.textContent || e.id).trim().slice(0, 30)}`, ok: visivel(c) || visivel(a) || c.boxShadow !== 'none' || noRotulo };
          });
          if (r && !r.ok) semAnel.push(r.rotulo);
        }
        if (semAnel.length) problemas.push(`foco sem indicador em ${onde}: ${semAnel.join(' | ')}`);
      };
      const rolarAoTopo = () => pagina.evaluate(() => scrollTo(0, 0));
      const botaoContinuar = () => pagina.getByRole('button', { name: 'Continuar', exact: true });
      const legenda = async () => (await pagina.locator('.pergunta legend').textContent().catch(() => null));
      const idAtual = () => pagina.locator('.pergunta input').first().getAttribute('name');
      const contagem = async () => { const t = await pagina.locator('#pergunta-contagem').innerText(); const m = /Pergunta (\d+) de (\d+)/.exec(t); return { n: Number(m[1]), de: Number(m[2]) }; };
      const responder = async (ids) => { for (const rid of ids) await pagina.locator('.pergunta').getByLabel(textoResposta[rid], { exact: true }).check(); };
      const desmarcar = async (rid) => pagina.locator('.pergunta').getByLabel(textoResposta[rid], { exact: true }).uncheck();
      // Continuar/Voltar dentro das perguntas: espera a tela mudar (outra pergunta, ou o relato)
      const trocarTela = async (botao) => {
        const antes = await legenda();
        await botao.click();
        await pagina.waitForFunction(a => { const l = document.querySelector('.pergunta legend'); return !l || l.textContent !== a; }, antes);
      };
      const avancar = () => trocarTela(botaoContinuar());
      const voltarUma = () => trocarTela(pagina.getByRole('button', { name: 'Voltar', exact: true }));
      // responde (primeira resposta, salvo `escolhas`) até chegar em `ate` (sem responder) ou ao relato
      const percorrer = async (escolhas = {}, ate = null, depois = {}) => {
        const vistas = [];
        for (let n = 0; n < 90; n++) {
          if (!(await pagina.locator('.pergunta').count())) return { vistas, parou: null };
          const id = await idAtual();
          if (id === ate) return { vistas, parou: id };
          vistas.push(id);
          await responder(escolhas[id] ?? [primeiraResposta(id)]);
          if (depois[id]) await depois[id]();
          await avancar();
        }
        throw new Error('perguntas demais: ' + vistas.join(','));
      };
      const aSituacao = async (nome) => {
        await pagina.getByRole('radio', { name: new RegExp('^' + nome) }).check();
        await botaoContinuar().click();
        await pagina.getByRole('heading', { name: 'O que está acontecendo?' }).waitFor();
      };
      const marcarOpcoes = async (ids) => { for (const oid of ids) await pagina.getByRole('checkbox', { name: textoOpcao[oid], exact: true }).check(); };
      const escreverRelato = async (texto) => {
        await pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor();
        await pagina.getByLabel('O que aconteceu?', { exact: true }).fill(texto);
      };
      const enviarAnonimo = async () => {
        await botaoContinuar().click();
        await pagina.getByRole('heading', { name: 'Provas e identificação' }).waitFor();
        await pagina.getByRole('button', { name: 'Enviar pedido de ajuda' }).click();
        await pagina.getByRole('heading', { name: 'Você deu o primeiro passo.' }).waitFor();
      };

      try {
        // ---- Início
        await pagina.goto(`${aluno}/`);
        await pagina.getByRole('heading', { level: 1, name: /Você não precisa lidar com isso/ }).waitFor();
        await ok('fundo do body acompanha o tema atrás do app (overscroll)', async () => {
          const c = await pagina.evaluate(() => {
            const cor = (e) => getComputedStyle(e).backgroundColor;
            return { body: cor(document.body), html: cor(document.documentElement), app: cor(document.querySelector('.aluno-app')) };
          });
          if (c.body !== c.app && c.html !== c.app) throw new Error(`body ${c.body} html ${c.html} app ${c.app}`);
        });
        await pagina.waitForTimeout(250);
        await foto('inicio'); await medir('inicio'); await cortes('inicio'); await foco('inicio', 8);
        await ok('bilhete tem símbolo, título e assinatura visíveis', async () => {
          const r = await pagina.evaluate(() => {
            const b = document.querySelector('.bilhete'); const s = document.querySelector('.bilhete-simbolo');
            if (!b || !s) return null;
            const rb = b.getBoundingClientRect(); const rs = s.getBoundingClientRect();
            return { dentro: rs.left >= -1 && rs.right <= innerWidth + 1, rs: [rs.left, rs.top, rs.right], rb: [rb.left, rb.top] };
          });
          if (!r || !r.dentro) throw new Error('símbolo fora da janela ' + JSON.stringify(r));
        });

        // ---- Pedir ajuda, passo 1
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await ok('passo 1 mostra as situações', () => pagina.getByRole('heading', { name: 'Qual é a situação?' }).waitFor());
        await ok('foco no título do passo', () => pagina.waitForFunction(() => document.activeElement?.tagName === 'H1'));
        await foto('passo1'); await medir('passo1'); await cortes('passo1'); await foco('passo1', 8);
        await botaoContinuar().click();
        await ok('passo 1 exige uma situação', () => pagina.getByRole('alert').filter({ hasText: 'Escolha uma situação' }).waitFor());
        await pagina.getByRole('radio', { name: /^Ameaças/ }).check();
        await foto('passo1-escolhida'); await medir('passo1-escolhida');
        await botaoContinuar().click();

        // ---- (A) passo 2: opções do servidor e perguntas encadeadas
        await ok('passo 2 mostra as opções da situação', () => pagina.getByRole('heading', { name: 'O que está acontecendo?' }).waitFor());
        await botaoContinuar().click();
        await ok('passo 2 exige uma opção', () => pagina.getByRole('alert').filter({ hasText: 'Escolha pelo menos uma opção' }).waitFor());
        await marcarOpcoes(['a1', 'a5']);
        await foto('passo2'); await medir('passo2'); await cortes('passo2'); await foco('passo2', 8);
        await botaoContinuar().click();
        await pagina.locator('.pergunta legend').waitFor();
        await ok('foco na pergunta da vez', () => pagina.waitForFunction(() => document.activeElement?.tagName === 'LEGEND'));
        await foto('pergunta'); await medir('pergunta'); await cortes('pergunta'); await foco('pergunta', 8);
        const ate = await percorrer({ q6: ['q6.nao'] }, 'a5.quer', {
          q6: async () => {
            await ok('q6.nao mostra a orientação de risco na própria pergunta', async () => {
              await pagina.locator('.pergunta .aviso.orientacao').waitFor();
              if (!/procure um adulto de confiança/.test(await pagina.locator('.pergunta .aviso.orientacao').innerText())) throw new Error('texto');
            });
            await foto('pergunta-risco'); await medir('pergunta-risco'); await cortes('pergunta-risco');
          },
        });
        await ok('as perguntas seguem a ordem da definição até a5.quer', async () => { if (ate.parou !== 'a5.quer') throw new Error(String(ate.parou)); });
        // salto: a5.quer abre perguntas de v4 (fotos) e g1 (dinheiro) conforme a resposta
        const antesSalto = await contagem();
        await responder(['a5.quer.dinheiro', 'a5.quer.fotos']);
        const depoisSalto = await contagem();
        await ok('marcar dinheiro e fotos abre perguntas de g1 e v4 (contagem sobe 9)', async () => { if (depoisSalto.de - antesSalto.de !== 9) throw new Error(`${antesSalto.de} -> ${depoisSalto.de}`); });
        await foto('pergunta-salto'); await medir('pergunta-salto');
        await avancar(); await responder([primeiraResposta('a5.fez')]);
        await avancar(); await responder([primeiraResposta('a5.prazo')]);
        await avancar();
        await ok('depois de a5.prazo vem a pergunta de v4', async () => { if ((await idAtual()) !== 'v4.menor') throw new Error(String(await idAtual())); });
        await responder(['v4.menor.sim']);
        // volta três perguntas e tira "Mandar fotos": v4 some, g1 continua
        await voltarUma(); await voltarUma(); await voltarUma();
        await ok('voltar três vezes mostra a5.quer com as respostas guardadas', async () => {
          if ((await idAtual()) !== 'a5.quer') throw new Error(String(await idAtual()));
          if (!(await pagina.locator('.pergunta').getByLabel('Mandar fotos', { exact: true }).isChecked())) throw new Error('resposta perdida');
        });
        await desmarcar('a5.quer.fotos');
        const depoisVolta = await contagem();
        await ok('desmarcar fotos fecha as 4 perguntas de v4', async () => { if (depoisSalto.de - depoisVolta.de !== 4) throw new Error(`${depoisSalto.de} -> ${depoisVolta.de}`); });
        await avancar(); await avancar(); await avancar();
        await ok('depois de a5.prazo a próxima é de g1 e v4 não volta', async () => { if ((await idAtual()) !== 'g1.pagou') throw new Error(String(await idAtual())); });
        await foto('pergunta-g1'); await medir('pergunta-g1'); await cortes('pergunta-g1');
        await percorrer();
        await ok('as perguntas terminam no relato', () => pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor());

        // ---- passo 3: relato
        const relatoA = `Alguém me ameaça por mensagem e quer algo de mim, ref ${marca}.`;
        await ok('passo 3 abre o relato', () => pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor());
        await botaoContinuar().click();
        await ok('passo 3 exige texto próprio de 10 caracteres', () => pagina.getByRole('alert').filter({ hasText: 'pelo menos 10 caracteres' }).waitFor());
        await pagina.getByLabel('O que aconteceu?', { exact: true }).fill(relatoA);
        await pagina.getByLabel(/Quando aconteceu/).fill('Desde segunda-feira');
        await pagina.getByLabel(/Onde aconteceu/).fill('Grupo da turma no aplicativo de mensagens');
        await foto('passo3'); await medir('passo3'); await cortes('passo3'); await foco('passo3', 8);
        // o rascunho fica no navegador (texto), sem código nem imagens
        await ok('rascunho de 24 horas guarda só o texto', async () => {
          const r = await pagina.evaluate(() => JSON.parse(localStorage.getItem('si-aluno-rascunho-v3') ?? 'null'));
          if (!r || !r.salvoEm) throw new Error('sem rascunho');
          if (JSON.stringify(r).includes('v4.')) throw new Error('rascunho com resposta de v4');
        });
        await pagina.getByRole('button', { name: 'Continuar' }).click();

        // ---- passo 4: imagem, girar, identificação
        await ok('passo 4 abre', () => pagina.getByRole('heading', { name: 'Provas e identificação' }).waitFor());
        await pagina.getByLabel('Adicionar imagens').setInputFiles({ name: 'prova.png', mimeType: 'image/png', buffer: imagem });
        await pagina.locator('.anexos img').waitFor();
        await pagina.waitForFunction(() => { const i = document.querySelector('.anexos img'); return i && i.naturalWidth > 0; });
        const larguraAntes = await pagina.evaluate(() => document.querySelector('.anexos img').naturalWidth);
        await foto('passo4-imagem'); await medir('passo4-imagem'); await cortes('passo4-imagem');
        await pagina.getByRole('button', { name: 'Girar prova.png' }).click();
        await ok('Girar troca largura e altura da prévia', async () => {
          await pagina.waitForFunction(a => { const i = document.querySelector('.anexos img'); return i && i.naturalWidth > 0 && i.naturalWidth !== a; }, larguraAntes, { timeout: 5000 });
          const dep = await pagina.evaluate(() => { const i = document.querySelector('.anexos img'); return [i.naturalWidth, i.naturalHeight]; });
          if (dep[0] !== 80 || dep[1] !== 160) throw new Error(`depois ${dep}`);
        });
        await foto('passo4-girada'); await medir('passo4-girada'); await cortes('passo4-girada'); await foco('passo4-girada', 14);
        await pagina.getByRole('radio', { name: 'Quero me identificar' }).check();
        await pagina.getByRole('button', { name: 'Enviar pedido de ajuda' }).click();
        await ok('identificar-se exige o nome', () => pagina.getByRole('alert').filter({ hasText: 'Preencha seu nome' }).waitFor());
        await foto('passo4-identificado'); await medir('passo4-identificado');
        await pagina.getByRole('radio', { name: 'Quero ficar anônimo' }).check();
        await pagina.getByRole('button', { name: 'Enviar pedido de ajuda' }).click();

        // ---- Confirmação
        await pagina.getByRole('heading', { name: 'Você deu o primeiro passo.' }).waitFor();
        const codigo = (await pagina.locator('.codigo').innerText()).trim();
        await ok('código no formato esperado', async () => { if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) throw new Error('formato'); });
        await pagina.getByRole('button', { name: 'Copiar código' }).click();
        await ok('copiar código avisa e coloca na área de transferência', async () => {
          await pagina.getByText('Código copiado').waitFor();
          const copiado = await pagina.evaluate(() => navigator.clipboard.readText());
          if (copiado !== codigo) throw new Error('conteúdo diferente');
        });
        await ok('rascunho some depois do envio', async () => {
          if (await pagina.evaluate(() => localStorage.getItem('si-aluno-rascunho-v3'))) throw new Error('rascunho continua');
        });
        await ok('código fora de URL e do armazenamento', async () => {
          const r = await pagina.evaluate(() => JSON.stringify([location.href, { ...localStorage }, { ...sessionStorage }]));
          if (r.includes(codigo) || r.includes(codigo.replace('-', ''))) throw new Error('código encontrado');
        });
        await ok('a confirmação mostra a orientação de risco', async () => {
          await pagina.locator('.confirmacao .aviso.orientacao').waitFor();
          if (/não foram enviadas/.test(await pagina.locator('.confirmacao').innerText())) throw new Error('respostas não enviadas');
        });
        await pagina.waitForTimeout(250);
        await foto('confirmacao'); await medir('confirmacao'); await cortes('confirmacao'); await foco('confirmacao', 6);
        await ok('o navegador enviou respostas só de perguntas visíveis, sem v4, e o relato limpo', async () => {
          const e = envios[0];
          const r = respostasDoEnvio(e);
          if (!r) throw new Error('sem campo respostas');
          if (r.situacao !== 'ameaca' || r.marcadas.join() !== 'a1,a5') throw new Error(`situacao/marcadas ${r.situacao} ${r.marcadas}`);
          if (Object.keys(r.respostas).some(k => k.startsWith('v4.'))) throw new Error('resposta de pergunta que fechou');
          if (!r.respostas['g1.pagou'] || r.respostas.q6?.join() !== 'q6.nao') throw new Error('faltam respostas');
          if (JSON.stringify(r.respostas['a5.quer']) !== '["a5.quer.dinheiro"]') throw new Error('a5.quer ' + JSON.stringify(r.respostas['a5.quer']));
          if (relatoDoEnvio(e) !== relatoA || /Situações marcadas/.test(e)) throw new Error('relato com bloco');
        });
        const caso = await achar(marca);
        await ok('coordenação recebe o caso com o questionário no detalhe e o relato limpo', async () => {
          if (!caso) throw new Error('caso não encontrado');
          const d = await api('GET', `/api/casos/${caso.id}`);
          if (d.relato !== relatoA) throw new Error('relato diferente');
          const q = d.questionario;
          if (!q || q.situacao.id !== 'ameaca' || q.marcadas.length !== 2) throw new Error('questionario ' + JSON.stringify(q)?.slice(0, 80));
          const risco = q.dimensoes.find(x => x.id === 'risco');
          if (!risco || !risco.itens.some(it => it.respostas.includes('Não'))) throw new Error('sem risco Não');
          if (!d.anonimo || d.nome) throw new Error('não está anônimo');
          if (d.anexos.length !== 1) throw new Error(`anexos ${d.anexos.length}`);
        });
        casosVerificados.push({ combinacao: nome, id: caso?.id, marca });

        // ---- Acompanhar (botão da confirmação) e depois por código digitado
        await pagina.getByRole('button', { name: 'Acompanhar meu caso' }).click();
        await pagina.getByRole('heading', { name: 'Acompanhar meu caso', level: 1 }).waitFor();
        await ok('timeline de 3 estados com "Recebido" atual', async () => {
          await pagina.locator('.etapa[data-estado="atual"]', { hasText: 'Recebido' }).waitFor();
          if ((await pagina.locator('.etapa').count()) !== 3) throw new Error('não são 3 etapas');
        });
        await ok('o aluno não vê prioridade nem notas', async () => {
          const t = await pagina.locator('main').innerText();
          if (/prioridade|cr[ií]tica|nota interna/i.test(t)) throw new Error('vazou texto interno');
        });
        await pagina.waitForTimeout(250);
        await foto('acompanhar-recebido'); await medir('acompanhar-recebido'); await cortes('acompanhar-recebido');
        await pagina.reload();
        await pagina.getByRole('heading', { level: 1, name: /Você não precisa lidar/ }).waitFor();
        await pagina.getByLabel('Acompanhar meu caso').fill(` ${codigo.toLowerCase().replace('-', ' ')} `);
        await pagina.locator('.acompanhamento-inicio').getByRole('button', { name: 'Acompanhar' }).click();
        await ok('acompanhar por código minúsculo com espaço', () => pagina.getByRole('heading', { name: 'Conversa com a coordenação' }).waitFor());
        await ok('código não vai para a URL', async () => { if (/[?#]/.test(new URL(pagina.url()).search + new URL(pagina.url()).hash)) throw new Error(pagina.url()); });
        await pagina.getByLabel('Sua resposta').fill('Obrigado, estou aguardando.');
        await pagina.getByRole('button', { name: 'Enviar resposta' }).click();
        await ok('resposta do aluno aparece na conversa', () => pagina.locator('.mensagem[data-autor="aluno"]', { hasText: 'Obrigado, estou aguardando.' }).waitFor());
        await foto('conversa-aluno'); await medir('conversa-aluno'); await cortes('conversa-aluno'); await foco('conversa-aluno', 8);

        // ---- Coordenação responde e investiga
        await api('POST', `/api/casos/${caso.id}/mensagens`, { texto: 'Recebemos o seu pedido. Vamos conversar com cuidado.' });
        await api('POST', `/api/casos/${caso.id}/status`, { status: 'em_investigacao' });
        await pagina.getByRole('button', { name: 'Atualizar conversa' }).click();
        await ok('mensagem da coordenação e etapa "Em investigação"', async () => {
          await pagina.locator('.mensagem[data-autor="coordenacao"]').waitFor();
          await pagina.locator('.etapa[data-estado="atual"]', { hasText: 'Em investigação' }).waitFor();
        });
        await pagina.waitForTimeout(250);
        await foto('conversa-investigacao'); await medir('conversa-investigacao'); await cortes('conversa-investigacao');

        // ---- Resolução com marcação HTML, para provar o texto literal
        await api('POST', `/api/casos/${caso.id}/resolucao`, { desfecho: 'intervencao_realizada', providencias: 'Conversamos com a turma e com a família. <b>teste</b> de marcação.', resultado: 'Situação encerrada. <i>teste</i> de resultado.' });
        await pagina.getByRole('button', { name: 'Atualizar conversa' }).click();
        await ok('área pós-resolução aparece com a resolução', () => pagina.getByRole('heading', { name: 'Seu caso foi resolvido' }).waitFor());
        await ok('texto da equipe aparece literal, sem HTML', async () => {
          await pagina.getByText('<b>teste</b>', { exact: false }).first().waitFor();
          if (await pagina.locator('.pos-resolucao b, .pos-resolucao i').count()) throw new Error('virou elemento HTML');
        });
        await ok('timeline marca "Resolvido"', () => pagina.locator('.etapa[data-estado="atual"]', { hasText: 'Resolvido' }).waitFor());
        await pagina.waitForTimeout(250);
        await foto('pos-resolucao'); await medir('pos-resolucao'); await cortes('pos-resolucao'); await foco('pos-resolucao', 8);
        await pagina.getByRole('button', { name: 'Voltou a acontecer' }).click();
        await ok('agradece e mostra "Você informou"', async () => {
          await pagina.getByText('Obrigado por contar. A equipe vai rever o que foi feito.').waitFor();
          await pagina.getByText('Você informou: Voltou a acontecer').waitFor();
        });
        await foto('pos-voltou'); await medir('pos-voltou'); await cortes('pos-voltou');
        await ok('a coordenação vê recorrencia_pendente no caso e no resumo', async () => {
          const d = await api('GET', `/api/casos/${caso.id}`);
          const r = await api('GET', '/api/resumo');
          if (!d.recorrencia_pendente) throw new Error('caso sem recorrência');
          if (!(r.recorrencia_pendente >= 1)) throw new Error('resumo sem recorrência');
          if (!d.situacoes.some(s => s.situacao === 'voltou')) throw new Error('situação não registrada');
        });

        // ---- Reabertura pela coordenação
        await api('POST', `/api/casos/${caso.id}/status`, { status: 'em_investigacao' });
        await pagina.getByRole('button', { name: 'Atualizar conversa' }).click();
        await ok('caso reaberto: o aluno deixa de ver o bloco pós-resolução', async () => {
          await pagina.locator('.etapa[data-estado="atual"]', { hasText: 'Em investigação' }).waitFor();
          if (await pagina.locator('.pos-resolucao').count()) throw new Error('bloco continua');
        });
        await foto('reaberto'); await medir('reaberto'); await cortes('reaberto');

        // ---- Código inválido
        await pagina.reload();
        await pagina.getByLabel('Acompanhar meu caso').fill('ZZZZ-ZZZZ');
        await pagina.locator('.acompanhamento-inicio').getByRole('button', { name: 'Acompanhar' }).click();
        await ok('código inexistente mostra a mensagem de 404', () => pagina.getByRole('alert').filter({ hasText: 'Não foi possível encontrar o caso' }).waitFor());
        await foto('codigo-invalido'); await medir('codigo-invalido');
        await rolarAoTopo();

        // ---- (B) Cyberbullying: c3 + c3.piadas.sim abre as perguntas de c1 sem marcar c1; trocar de situação limpa tudo
        const marcaB = `${marca}b`;
        await pagina.goto(`${aluno}/`);
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await aSituacao('Cyberbullying');
        await marcarOpcoes(['c3']);
        await botaoContinuar().click();
        await pagina.locator('.pergunta legend').waitFor();
        const vB = await percorrer({ 'c3.piadas': ['c3.piadas.sim'] });
        await ok('c3.piadas.sim abre as perguntas de c1 sem c1 marcada', async () => {
          for (const id of ['c1.onde', 'c1.prints', 'c1.alvos', 'c1.testemunhas']) if (!vB.vistas.includes(id)) throw new Error(`faltou ${id}; vistas ${vB.vistas.join(',')}`);
          if (vB.vistas.indexOf('c1.onde') < vB.vistas.indexOf('c3.piadas')) throw new Error('c1 antes de c3.piadas');
        });
        await foto('cyber-relato'); await medir('cyber-relato');
        // volta ao passo 1 e troca de situação
        for (let n = 0; n < 40 && !(await pagina.getByRole('heading', { name: 'Qual é a situação?' }).isVisible()); n++) {
          await pagina.getByRole('button', { name: 'Voltar', exact: true }).click();
          await pagina.waitForTimeout(40);
        }
        await ok('voltar chega ao passo 1', () => pagina.getByRole('heading', { name: 'Qual é a situação?' }).waitFor());
        await aSituacao('Golpe');
        await ok('trocar de situação limpa as opções marcadas', async () => {
          if ((await pagina.getByRole('checkbox', { checked: true }).count()) !== 0) throw new Error('opção continua marcada');
        });
        await marcarOpcoes(['g1']);
        await botaoContinuar().click();
        await pagina.locator('.pergunta legend').waitFor();
        const vG = await percorrer();
        await ok('as perguntas do golpe não trazem as de cyberbullying', async () => {
          if (vG.vistas.some(id => id.startsWith('c'))) throw new Error(vG.vistas.join(','));
        });
        await escreverRelato(`Pediram dinheiro por mensagem, ref ${marcaB}.`);
        await enviarAnonimo();
        await ok('o envio da troca leva só situação e opção nova', async () => {
          const r = respostasDoEnvio(envios[1]);
          if (!r || r.situacao !== 'golpe' || r.marcadas.join() !== 'g1') throw new Error(JSON.stringify(r)?.slice(0, 100));
          if (Object.keys(r.respostas).some(k => /^c\d/.test(k))) throw new Error('resposta da situação anterior');
          const d = await api('GET', `/api/casos/${(await achar(marcaB)).id}`);
          if (d.questionario?.situacao.id !== 'golpe' || d.questionario.marcadas.length !== 1) throw new Error('questionario no caso');
        });
        await foto('cyber-confirmacao'); await medir('cyber-confirmacao'); await cortes('cyber-confirmacao');

        // ---- (C) rascunho: sair no meio e voltar restaura; o passo volta ao 1
        await pagina.goto(`${aluno}/`);
        await pagina.evaluate(() => localStorage.clear());
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await aSituacao('Cyberbullying');
        await marcarOpcoes(['c3']);
        await botaoContinuar().click();
        await pagina.locator('.pergunta legend').waitFor();
        await responder(['q1.agora']);
        await avancar(); await responder(['q2.dia']);
        await pagina.goto(`${aluno}/`);
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await ok('o rascunho volta no passo 1 com a situação marcada', async () => {
          await pagina.getByRole('heading', { name: 'Qual é a situação?' }).waitFor();
          if (!(await pagina.getByRole('radio', { name: /^Cyberbullying/ }).isChecked())) throw new Error('situação perdida');
        });
        await botaoContinuar().click();
        await ok('as opções e as respostas voltam marcadas', async () => {
          await pagina.getByRole('checkbox', { name: textoOpcao.c3, exact: true }).waitFor();
          if (!(await pagina.getByRole('checkbox', { name: textoOpcao.c3, exact: true }).isChecked())) throw new Error('opção perdida');
          await botaoContinuar().click();
          await pagina.locator('.pergunta legend').waitFor();
          if ((await idAtual()) !== 'q1' || !(await pagina.locator('.pergunta').getByLabel('Sim, agora', { exact: true }).isChecked())) throw new Error('resposta de q1 perdida');
        });
        await foto('rascunho-restaurado'); await medir('rascunho-restaurado'); await cortes('rascunho-restaurado');
        await pagina.evaluate(() => localStorage.clear());

        // ---- (D) definição indisponível: 503 no GET /api/questionario; o pedido segue só com situação e relato
        const marcaD = `${marca}d`;
        await pagina.route('**/api/questionario', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"erro":"questionario indisponivel"}' }));
        await pagina.goto(`${aluno}/`);
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await pagina.getByRole('radio', { name: /^Ameaças/ }).check();
        await botaoContinuar().click();
        await ok('sem definição o passo 2 é pulado e o aviso aparece no relato', async () => {
          await pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor();
          await pagina.getByText('Não foi possível carregar as perguntas agora').waitFor();
        });
        await foto('sem-definicao'); await medir('sem-definicao'); await cortes('sem-definicao');
        await escreverRelato(`Alguém me ameaçou por mensagem, ref ${marcaD}.`);
        await enviarAnonimo();
        await ok('o pedido chegou sem o campo respostas e a coordenação o vê sem questionário', async () => {
          if (respostasDoEnvio(envios[2]) !== null || /name="respostas"/.test(envios[2])) throw new Error('enviou respostas');
          const d = await api('GET', `/api/casos/${(await achar(marcaD)).id}`);
          if (d.questionario !== null) throw new Error('questionario não nulo');
          if (relatoDoEnvio(envios[2]) !== `Alguém me ameaçou por mensagem, ref ${marcaD}.`) throw new Error('relato');
        });
        casosVerificados.push({ combinacao: nome, id: (await achar(marcaD))?.id, marca: marcaD, semRespostas: true });
        await pagina.unroute('**/api/questionario');

        // ---- (E) definição que nunca responde: "Carregando as perguntas…" e "Continuar só com o relato"
        await pagina.route('**/api/questionario', () => { /* nunca responde */ });
        await pagina.goto(`${aluno}/`);
        await pagina.getByRole('button', { name: 'Preciso de ajuda' }).click();
        await pagina.getByRole('radio', { name: /^Outros/ }).check();
        await botaoContinuar().click();
        await ok('fetch pendente mostra o carregando e a saída só com o relato', async () => {
          await pagina.getByText('Carregando as perguntas…').waitFor();
          await pagina.getByRole('button', { name: 'Continuar só com o relato' }).waitFor();
          if (!(await pagina.getByRole('button', { name: 'Continuar', exact: true }).isDisabled())) throw new Error('Continuar habilitado');
        });
        await foto('carregando'); await medir('carregando'); await cortes('carregando'); await foco('carregando', 4);
        await pagina.getByRole('button', { name: 'Continuar só com o relato' }).click();
        await ok('"Continuar só com o relato" leva ao relato', () => pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor());
        await pagina.unroute('**/api/questionario');
        await pagina.evaluate(() => localStorage.clear());
        // 404 do código inválido e o 503 simulado são esperados
        for (const r of respostasRuins) if (!r.endsWith('/api/acompanhar') && !r.endsWith('/api/questionario')) erros.push(`resposta inesperada ${r}`);
      } catch (falha) {
        problemas.push(`ABORTADO: ${String(falha.message ?? falha).split('\n')[0]}`);
        await foto('falha').catch(() => {});
      }
      const estilos = await pagina.evaluate(() => [...document.querySelectorAll('[style]')].map(e => `${e.tagName.toLowerCase()}.${e.className}`)).catch(() => ['?']);
      resultados.push({ nome, passos: passos.length, maiorExcessoHorizontal: maiorExcesso, elementosComStyle: estilos, violacoesCsp: violacoes, errosConsole: erros, problemas });
      await contexto.close();
    }
  }
} finally { await navegador.close(); }

// ---- Triagem: as respostas não alteram prioridade nem pontos (pesos e alertas vazios)
const triagem = [];
if (process.env.SI_TRIAGEM !== '0') {
  const neutro = 'Preciso conversar já'; // relato neutro de 20 caracteres
  const novoCaso = async (tipo, respostas) => {
    const form = new FormData();
    form.append('tipo', tipo); form.append('relato', neutro);
    form.append('anonimo', 'true'); form.append('em_andamento', 'false'); form.append('quando', ''); form.append('onde', '');
    if (respostas) form.append('respostas', respostas);
    const r = await fetch(`${aluno}/api/denuncias`, { method: 'POST', body: form });
    if (r.status !== 201) throw new Error(`denuncia ${r.status}`);
    // os casos são criados em sequência: o mais novo do tipo é o que acabou de entrar
    const achado = (await api('GET', `/api/casos?tipo=${tipo}`)).casos.filter(c => !c.simulacao).sort((a, b) => b.id - a.id)[0];
    const d = await api('GET', `/api/casos/${achado.id}`);
    return { caso: achado.id, prioridade: d.prioridade, pontos: d.pontos, motivos: achado.motivos, questionario: d.questionario !== null };
  };
  for (const s of def.situacoes) {
    const marcadas = s.opcoes.map(o => o.id);
    // a primeira resposta de cada pergunta visível, até estabilizar
    let respostas = {};
    for (let n = 0; n < 12; n++) {
      const visiveis = perguntasVisiveis(def, s.id, marcadas, respostas);
      const novas = Object.fromEntries(visiveis.map(id => [id, [primeiraResposta(id)]]));
      if (JSON.stringify(novas) === JSON.stringify(respostas)) break;
      respostas = novas;
    }
    const corpo = montarEnvio(def, s.id, marcadas, respostas);
    const ids = marcadas.length + Object.values(respostas).flat().length;
    try {
      const sem = await novoCaso(s.tipo, null);
      const com = await novoCaso(s.tipo, corpo);
      const igual = sem.prioridade === com.prioridade && sem.pontos === com.pontos && JSON.stringify(sem.motivos) === JSON.stringify(com.motivos);
      triagem.push({ situacao: s.id, opcoes: marcadas.length, perguntas: Object.keys(respostas).length, ids, bytes: Buffer.byteLength(corpo), semRespostas: { prioridade: sem.prioridade, pontos: sem.pontos }, comRespostas: { prioridade: com.prioridade, pontos: com.pontos, comQuestionario: com.questionario }, igual });
    } catch (e) { triagem.push({ situacao: s.id, ids, erro: String(e.message ?? e) }); }
  }
}
await writeFile(fileURLToPath(new URL('./resultado-aluno.json', import.meta.url)), JSON.stringify({ resultados, triagem, casosVerificados }, null, 2));
console.log(JSON.stringify({ resultados, triagem, casosVerificados }, null, 2));
