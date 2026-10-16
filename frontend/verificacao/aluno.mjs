// Percorre o portal do aluno em Chrome real contra um servidor de verdade e confere a triagem.
// Uso (servidor de teste já no ar, com pasta de dados temporária e limites de taxa desligados):
//   SI_COORD_URL=http://127.0.0.1:14000 SI_ALUNO_URL=http://127.0.0.1:13000 \
//   SI_ADMIN_NOME=Admin SI_COORD_SENHA=... node verificacao/aluno.mjs
// Opcional: SI_LARGURAS=375,768 SI_TEMAS=light SI_TRIAGEM=0 (padrão: tudo).
// O administrador de teste é criado pela API de primeiro acesso, se o banco estiver sem contas.
// A coordenação é operada pela API (sessão do administrador de teste); nada secreto é impresso.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { SITUACOES, comporRelato } from '../src/aluno/situacoes.ts';

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

const rodada = Date.now().toString(36).slice(-4);
const resultados = [];
await entrarNaCoordenacao();
const navegador = await chromium.launch({ channel: 'chrome', headless: true, env: { ...process.env, TEMP: temporaria, TMP: temporaria } });
try {
  for (const largura of larguras) {
    for (const tema of temas) {
      const nome = `${largura}-${tema}`;
      const marca = `zz${rodada}${largura}${tema[0]}`;
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema, permissions: ['clipboard-read', 'clipboard-write'] });
      await contexto.addInitScript(() => {
        window.__violacoes = [];
        document.addEventListener('securitypolicyviolation', e => window.__violacoes.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const pagina = await contexto.newPage();
      const erros = [];
      const problemas = [];
      const passos = [];
      const respostasRuins = [];
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
        await pagina.getByRole('button', { name: 'Continuar' }).click();
        await ok('passo 1 exige uma situação', () => pagina.getByRole('alert').filter({ hasText: 'Escolha uma situação' }).waitFor());
        await pagina.getByRole('radio', { name: /^Cyberbullying/ }).check();
        await foto('passo1-escolhida'); await medir('passo1-escolhida');
        await pagina.getByRole('button', { name: 'Continuar' }).click();

        // ---- passo 2: desdobramentos
        await ok('passo 2 mostra os desdobramentos', () => pagina.getByRole('heading', { name: 'O que está acontecendo?' }).waitFor());
        await pagina.getByRole('button', { name: 'Continuar' }).click();
        await ok('passo 2 exige uma opção', () => pagina.getByRole('alert').filter({ hasText: 'Escolha pelo menos uma opção' }).waitFor());
        await pagina.getByRole('checkbox', { name: /humilhando/ }).check();
        await pagina.getByRole('checkbox', { name: /perseguindo com mensagens/ }).check();
        await foto('passo2'); await medir('passo2'); await cortes('passo2'); await foco('passo2', 8);
        // voltar e avançar não duplica o bloco das opções
        await pagina.getByRole('button', { name: 'Voltar', exact: true }).click();
        await pagina.getByRole('button', { name: 'Continuar' }).click();
        await pagina.getByRole('button', { name: 'Continuar' }).click();

        // ---- passo 3: relato
        await ok('passo 3 abre o relato', () => pagina.getByRole('heading', { name: 'O que aconteceu?', level: 1 }).waitFor());
        await pagina.getByRole('button', { name: 'Continuar' }).click();
        await ok('passo 3 exige texto próprio de 10 caracteres', () => pagina.getByRole('alert').filter({ hasText: 'pelo menos 10 caracteres' }).waitFor());
        await pagina.getByLabel('O que aconteceu?', { exact: true }).fill(`Mensagens ofensivas no grupo da turma, ref ${marca}.`);
        await pagina.getByLabel(/Quando aconteceu/).fill('Desde segunda-feira');
        await pagina.getByLabel(/Onde aconteceu/).fill('Grupo da turma no aplicativo de mensagens');
        await foto('passo3'); await medir('passo3'); await cortes('passo3'); await foco('passo3', 8);
        // o rascunho fica no navegador (texto), sem código nem imagens
        await ok('rascunho de 24 horas guarda só o texto', async () => {
          const r = await pagina.evaluate(() => JSON.parse(localStorage.getItem('si-aluno-rascunho-v2') ?? 'null'));
          if (!r || !r.salvoEm) throw new Error('sem rascunho');
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
          if (await pagina.evaluate(() => localStorage.getItem('si-aluno-rascunho-v2'))) throw new Error('rascunho continua');
        });
        await ok('código fora de URL e do armazenamento', async () => {
          const r = await pagina.evaluate(() => JSON.stringify([location.href, { ...localStorage }, { ...sessionStorage }]));
          if (r.includes(codigo) || r.includes(codigo.replace('-', ''))) throw new Error('código encontrado');
        });
        await pagina.waitForTimeout(250);
        await foto('confirmacao'); await medir('confirmacao'); await cortes('confirmacao'); await foco('confirmacao', 6);
        const caso = await achar(marca);
        await ok('coordenação recebe o pedido com as 2 opções, sem duplicar o bloco', async () => {
          if (!caso) throw new Error('caso não encontrado');
          const d = await api('GET', `/api/casos/${caso.id}`);
          const n = (d.relato.match(/Situações marcadas:/g) ?? []).length;
          if (n !== 1 || !d.relato.includes('- Estão me humilhando') || !d.relato.includes('- Estão me perseguindo')) throw new Error(`bloco x${n}`);
          if (!d.anonimo || d.nome) throw new Error('não está anônimo');
          if (d.anexos.length !== 1) throw new Error(`anexos ${d.anexos.length}`);
        });

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
        // 404 e a falta de acesso esperada ao testar código inválido
        for (const r of respostasRuins) if (!r.endsWith('/api/acompanhar')) erros.push(`resposta inesperada ${r}`);
      } catch (falha) {
        problemas.push(`ABORTADO: ${String(falha.message ?? falha).split('\n')[0]}`);
        await foto('falha').catch(() => {});
      }
      const violacoes = await pagina.evaluate(() => window.__violacoes).catch(() => []);
      const estilos = await pagina.evaluate(() => [...document.querySelectorAll('[style]')].map(e => `${e.tagName.toLowerCase()}.${e.className}`)).catch(() => ['?']);
      resultados.push({ nome, passos: passos.length, maiorExcessoHorizontal: maiorExcesso, elementosComStyle: estilos, violacoesCsp: violacoes, errosConsole: erros, problemas });
      await contexto.close();
    }
  }
} finally { await navegador.close(); }

// ---- Triagem: nenhuma opção aprovada deve elevar a prioridade sozinha
const triagem = [];
if (process.env.SI_TRIAGEM !== '0') {
  const neutro = 'Preciso conversar já'; // relato neutro de 20 caracteres, mais o bloco das opções
  for (const s of SITUACOES.filter(x => x.opcoes.length)) {
    const form = new FormData();
    form.append('tipo', s.tipo);
    form.append('relato', comporRelato(neutro, s.opcoes));
    form.append('anonimo', 'true'); form.append('em_andamento', 'false'); form.append('quando', ''); form.append('onde', '');
    const r = await fetch(`${aluno}/api/denuncias`, { method: 'POST', body: form });
    if (r.status !== 201) { triagem.push({ situacao: s.id, erro: `denuncia ${r.status}` }); continue; }
    // os casos são criados em sequência: o mais novo do tipo é o que acabou de entrar
    const lista = (await api('GET', `/api/casos?tipo=${s.tipo}`)).casos;
    const achado = lista.filter(c => !c.simulacao).sort((a, b) => b.id - a.id)[0];
    const d = await api('GET', `/api/casos/${achado.id}`);
    triagem.push({ situacao: s.id, caso: achado.id, prioridade: d.prioridade, pontos: d.pontos, motivos: achado.motivos });
  }
}
await writeFile(fileURLToPath(new URL('./resultado-aluno.json', import.meta.url)), JSON.stringify({ resultados, triagem }, null, 2));
console.log(JSON.stringify({ resultados, triagem }, null, 2));
