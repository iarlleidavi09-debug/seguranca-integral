// Percorre o portal da coordenação em Chrome real contra um servidor de verdade.
// Uso (servidor de teste já no ar, com pasta de dados temporária):
//   SI_COORD_URL=http://127.0.0.1:14000 SI_ALUNO_URL=http://127.0.0.1:13000 \
//   SI_ADMIN_NOME=Admin SI_COORD_SENHA=... node verificacao/coordenacao.mjs
// Opcional: SI_LARGURAS=375,768 SI_TEMAS=light SI_FOTOS=todas (padrão: todas as partes).
// Na primeira rodada, se o banco estiver sem contas, o administrador é criado pela tela de primeiro acesso.
// Cada combinação (largura x tema) cria os próprios casos pela API do aluno; nada é impresso além do resumo.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

async function criarCaso(dados) {
  const form = new FormData();
  for (const [k, v] of Object.entries(dados)) form.append(k, String(v));
  const r = await fetch(`${aluno}/api/denuncias`, { method: 'POST', body: form });
  if (r.status !== 201) throw new Error(`denuncia ${r.status}`);
  return (await r.json()).codigo;
}
async function situacaoDoAluno(codigo, situacao) {
  const r = await fetch(`${aluno}/api/acompanhar/situacao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, situacao }),
  });
  if (r.status !== 201) throw new Error(`situacao ${r.status}`);
}

const rodada = Date.now().toString(36).slice(-4);
const resultados = [];
const navegador = await chromium.launch({ channel: 'chrome', headless: true, env: { ...process.env, TEMP: temporaria, TMP: temporaria } });
try {
  for (const largura of larguras) {
    for (const tema of temas) {
      const nome = `${largura}-${tema}`;
      const marca = `zz${rodada}${largura}${tema[0]}`;
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema });
      const violacoes = [];
      await contexto.exposeFunction('__relatarViolacao', (v) => violacoes.push(v));
      await contexto.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', e => window.__relatarViolacao(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const pagina = await contexto.newPage();
      const erros = [];
      const problemas = [];
      // respostas de erro esperadas: leitura da sessão antes do login e a senha errada de propósito
      const esperadas = ['/api/eu', '/api/login'];
      const respostasRuins = [];
      pagina.on('response', r => { if (r.status() >= 400) respostasRuins.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      pagina.on('console', m => {
        const falhaDeRecurso = /^Failed to load resource/.test(m.text());
        if ((m.type() === 'error' && !falhaDeRecurso) || /content security policy/i.test(m.text())) erros.push(m.text());
      });
      pagina.on('pageerror', e => erros.push(String(e)));
      const passos = [];
      const ok = async (descricao, teste) => {
        try { await teste(); passos.push(descricao); }
        catch (e) { problemas.push(`${descricao}: ${String(e.message ?? e).split('\n')[0]}`); }
      };
      const foto = async (parte) => pagina.screenshot({ path: `${capturas}coord-${nome}-${parte}.png`, fullPage: true });
      let maiorLargura = 0;
      const medir = async (onde) => {
        const m = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: innerWidth }));
        maiorLargura = Math.max(maiorLargura, m.s - m.w);
        if (m.s > m.w) problemas.push(`rolagem horizontal em ${onde}: ${m.s} > ${m.w}`);
      };
      // texto cortado: elemento com overflow oculto cujo conteúdo é maior que a caixa (abas rolam de propósito)
      const cortes = async (onde) => {
        const lista = await pagina.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {
          const c = getComputedStyle(e);
          if (!e.textContent?.trim() || e.closest('.abas, .so-leitor') || e.matches('.so-leitor, thead')) return false;
          return (c.overflowX === 'hidden' || c.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1;
        }).map(e => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 5));
        if (lista.length) problemas.push(`texto cortado em ${onde}: ${lista.join(', ')}`);
      };
      // percorre N foco por Tab e acusa controles sem indicador visível
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
            const sombra = c.boxShadow !== 'none';
            return { rotulo: `${e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') || e.textContent || e.id).trim().slice(0, 30)}`, ok: visivel(c) || visivel(a) || sombra };
          });
          if (r && !r.ok) semAnel.push(r.rotulo);
        }
        if (semAnel.length) problemas.push(`foco sem indicador em ${onde}: ${semAnel.join(' | ')}`);
      };

      try {
      // casos do aluno desta rodada
      const base = { anonimo: 'true', quando: 'ontem', onde: 'escola' };
      const codCritico = await criarCaso({ ...base, tipo: 'ameaca', em_andamento: 'true', relato: `Ele me ameaçou na saída e disse vou te bater hoje, ref ${marca} critico.` });
      await criarCaso({ ...base, tipo: 'cyberbullying', relato: `Mensagens ofensivas no grupo da turma, ref ${marca} leve.` });
      await criarCaso({ ...base, tipo: 'golpe', relato: `Pediram dinheiro por mensagem em troca de silêncio, ref ${marca} golpe.` });
      // caso com respostas do questionário (cyberbullying; c3.piadas.sim abre as perguntas de c1)
      const respostasQ = JSON.stringify({
        situacao: 'cyberbullying', marcadas: ['c3'],
        respostas: {
          q1: ['q1.agora'], q2: ['q2.semana'], q5: ['q5.evito', 'q5.sono'],
          'c1.onde': ['c1.onde.grupo', 'c1.onde.rede'], 'c1.prints': ['c1.prints.sim'],
          'c3.de': ['c3.de.grupo'], 'c3.piadas': ['c3.piadas.sim'],
        },
      });
      await criarCaso({ ...base, tipo: 'cyberbullying', respostas: respostasQ, relato: `Fui deixado de fora das conversas da turma, ref ${marca} questionario.` });

      // ---- Primeiro acesso ou login
      await pagina.goto(`${coord}/`);
      const pendente = await pagina.evaluate(async () => (await (await fetch('/api/setup')).json()).pendente);
      if (pendente) {
        await ok('primeiro acesso cria o administrador', async () => {
          await pagina.getByRole('heading', { name: 'Criar conta de administrador' }).waitFor();
          await foto('setup');
          await medir('setup');
          await pagina.getByLabel('Nome', { exact: true }).fill(nomeAdmin);
          await pagina.getByLabel('Senha', { exact: true }).fill(senha);
          await pagina.getByLabel('Repita a senha').fill(senha);
          await pagina.getByRole('button', { name: 'Criar conta e entrar' }).click();
          await pagina.getByRole('heading', { name: 'Cada pedido merece atenção.' }).waitFor();
        });
      } else {
        await ok('login aparece sem sessão', async () => {
          await pagina.getByRole('heading', { name: 'Portal da coordenação' }).waitFor();
          if (await pagina.getByRole('navigation').count()) throw new Error('navegação visível sem sessão');
        });
        await foto('login');
        await medir('login');
        await foco('login', 4);
        await pagina.getByLabel('Nome', { exact: true }).fill(nomeAdmin);
        await pagina.getByLabel('Senha', { exact: true }).fill('senha errada qualquer');
        await pagina.getByRole('button', { name: 'Entrar' }).click();
        await ok('falha de login mostra a mensagem única', () => pagina.getByRole('alert').filter({ hasText: 'Nome ou senha incorretos.' }).waitFor());
        await pagina.getByLabel('Senha', { exact: true }).fill(senha);
        await pagina.getByRole('button', { name: 'Entrar' }).click();
        await pagina.getByRole('heading', { name: 'Cada pedido merece atenção.' }).waitFor();
      }

      // ---- Ensaio (simulação) e Visão geral
      await pagina.getByRole('button', { name: 'Ensaio' }).click();
      await pagina.getByRole('button', { name: 'Carregar casos de simulação' }).click();
      await ok('ensaio responde', () => pagina.getByRole('status').filter({ hasText: /caso|simulação/ }).first().waitFor());
      await foto('ensaio'); await medir('ensaio');
      await pagina.getByRole('button', { name: 'Visão geral' }).click();
      await pagina.getByRole('heading', { name: 'Cada pedido merece atenção.' }).waitFor();
      await ok('visão geral mostra prioridades', () => pagina.getByRole('heading', { name: 'Por prioridade' }).waitFor());
      await pagina.waitForTimeout(400);
      await foto('geral'); await medir('geral'); await cortes('geral'); await foco('geral', 10);

      // ---- Casos: busca, filtros, limpar
      await pagina.getByRole('button', { name: 'Casos', exact: true }).click();
      await pagina.getByRole('heading', { name: 'Casos', exact: true }).waitFor();
      await pagina.locator('.casos-linha').first().waitFor();
      await foto('casos'); await medir('casos'); await cortes('casos'); await foco('casos', 10);
      const busca = pagina.getByLabel('Buscar por assunto ou número do caso');
      await busca.fill(`ref ${marca}`);
      await ok('busca por texto acha os 4 casos da rodada', async () => {
        await pagina.waitForFunction(n => document.querySelectorAll('.casos-linha').length === n, 4);
      });
      await foto('casos-busca');
      const linhaCritica = pagina.locator('.casos-linha', { hasText: `${marca} critico` });
      const idCritico = Number((await linhaCritica.getByRole('button').getAttribute('aria-label')).match(/Caso (\d+)/)[1]);
      await ok('o caso crítico vem com prioridade Crítica', async () => {
        if ((await linhaCritica.getAttribute('data-gravidade')) !== 'critica') throw new Error(`prioridade ${await linhaCritica.getAttribute('data-gravidade')}`);
      });
      await busca.fill(String(idCritico));
      await ok('busca por número acha o caso', async () => {
        await pagina.waitForFunction(() => document.querySelectorAll('.casos-linha').length >= 1);
        await linhaCritica.waitFor();
      });
      await busca.fill(`ref ${marca}`);
      await pagina.getByLabel('Prioridade', { exact: true }).selectOption('critica');
      await ok('filtro de prioridade deixa só o crítico', async () => {
        await pagina.waitForFunction(() => document.querySelectorAll('.casos-linha').length === 1);
      });
      await pagina.getByLabel('Status', { exact: true }).selectOption('resolvido');
      await ok('filtro de status sem resultado', () => pagina.getByText(/Nenhum caso/).first().waitFor());
      await foto('casos-vazio');
      await pagina.getByRole('button', { name: 'Limpar filtros' }).click();
      await ok('limpar filtros devolve a lista', async () => {
        await pagina.locator('.casos-linha').first().waitFor();
        if (await pagina.getByRole('button', { name: 'Limpar filtros' }).count()) throw new Error('botão continua');
      });
      await busca.fill(`ref ${marca}`);
      await pagina.waitForFunction(() => document.querySelectorAll('.casos-linha').length === 4);
      // hover em linha crítica/alta no layout atual
      await linhaCritica.hover();
      await foto('casos-hover');
      const tabela = await pagina.evaluate(() => getComputedStyle(document.querySelector('.casos-tabela')).display);
      passos.push(`tabela display=${tabela}`);

      // ---- Caso com respostas do aluno
      const linhaQ = pagina.locator('.casos-linha', { hasText: `${marca} questionario` });
      await linhaQ.getByRole('button').click();
      await ok('caso abre com o bloco "Respostas do aluno" na aba do relato', async () => {
        await pagina.getByRole('heading', { name: /Caso \d+: Cyberbullying/ }).waitFor();
        await pagina.getByRole('heading', { name: 'Respostas do aluno' }).waitFor();
      });
      await ok('o bloco mostra situação, opção marcada e itens por dimensão', async () => {
        const t = await pagina.locator('.respostas-aluno').innerText();
        for (const x of ['Situação: Cyberbullying', 'Estão me excluindo de propósito.', 'Sim, agora', 'Grupo da turma', 'Rede social', 'Evito vir à escola']) if (!t.includes(x)) throw new Error(`falta "${x}"`);
        const grupos = await pagina.locator('.respostas-aluno h4').allInnerTexts();
        if (grupos.length < 3) throw new Error('dimensões ' + grupos.join(','));
        if (/O aluno não respondeu/.test(t)) throw new Error('mostrou vazio');
      });
      await pagina.waitForTimeout(300);
      await foto('caso-respostas'); await medir('caso-respostas'); await cortes('caso-respostas'); await foco('caso-respostas', 10);
      await pagina.getByRole('button', { name: 'Casos', exact: true }).click();
      await pagina.getByLabel('Buscar por assunto ou número do caso').fill(`ref ${marca}`);
      await pagina.waitForFunction(() => document.querySelectorAll('.casos-linha').length === 4);

      // ---- Caso crítico
      await linhaCritica.getByRole('button').click();
      await ok('caso abre com o título em foco', async () => {
        await pagina.getByRole('heading', { name: /Caso \d+: Ameaça/ }).waitFor();
        await pagina.waitForFunction(() => document.activeElement?.tagName === 'H1');
      });
      await ok('caso sem respostas mostra que o aluno não respondeu', async () => {
        await pagina.getByRole('heading', { name: 'Respostas do aluno' }).waitFor();
        await pagina.getByText('O aluno não respondeu ao questionário.').waitFor();
      });
      await ok('hash tem só o número', async () => { if (!/#caso-\d+$/.test(pagina.url())) throw new Error(pagina.url()); });
      await ok('motivos do alerta aparecem', () => pagina.getByText(/violência|violencia/i).first().waitFor());
      await pagina.waitForTimeout(300);
      await foto('caso'); await medir('caso'); await cortes('caso'); await foco('caso', 12);

      // reavaliar prioridade
      await pagina.getByRole('button', { name: 'Reavaliar prioridade' }).click();
      await ok('formulário de reavaliação abre com foco no seletor', async () => {
        await pagina.waitForFunction(() => document.activeElement?.id === 'reavaliar-nova');
      });
      await ok('confirmar fica desligado sem mudar a prioridade', async () => {
        if (!(await pagina.getByRole('button', { name: 'Confirmar' }).isDisabled())) throw new Error('habilitado');
      });
      await pagina.getByLabel('Nova prioridade').selectOption('alta');
      await pagina.getByRole('button', { name: 'Confirmar' }).click();
      await ok('justificativa vazia é recusada', () => pagina.getByRole('alert').filter({ hasText: /Escreva de 1 a/ }).waitFor());
      await pagina.getByLabel('Justificativa').fill('Falei com o aluno e o risco imediato passou.');
      await foto('caso-reavaliar'); await medir('caso-reavaliar');
      await pagina.getByRole('button', { name: 'Confirmar' }).click();
      await ok('prioridade reavaliada e registrada', () => pagina.getByText('Prioridade alterada para Alta.').waitFor());
      await ok('classificação original continua visível', () => pagina.getByText(/Classificação original/).waitFor());

      // abas por teclado
      await pagina.getByRole('tab', { name: 'Relato e investigação' }).focus();
      await pagina.keyboard.press('ArrowRight');
      await ok('seta direita vai a Conversa', () => pagina.getByRole('tab', { name: 'Conversa', selected: true }).waitFor());
      await pagina.keyboard.press('End');
      await ok('End vai a Histórico', () => pagina.getByRole('tab', { name: 'Histórico', selected: true }).waitFor());
      await ok('histórico mostra a justificativa', () => pagina.getByText(/risco imediato passou/).first().waitFor());
      await foto('caso-historico'); await medir('caso-historico');
      await pagina.keyboard.press('Home');
      await ok('Home volta ao Relato', () => pagina.getByRole('tab', { name: 'Relato e investigação', selected: true }).waitFor());
      await pagina.keyboard.press('ArrowLeft');
      await ok('seta esquerda dá a volta até Histórico', () => pagina.getByRole('tab', { name: 'Histórico', selected: true }).waitFor());
      await pagina.keyboard.press('ArrowRight');
      await pagina.keyboard.press('ArrowRight');
      await pagina.getByRole('tab', { name: 'Conversa', selected: true }).waitFor();
      await pagina.getByLabel('Mensagem ao aluno').fill('Recebemos o seu pedido. Vamos conversar com cuidado.');
      await pagina.getByRole('button', { name: 'Enviar ao aluno' }).click();
      await ok('mensagem ao aluno enviada', () => pagina.getByText('Mensagem enviada ao aluno.').waitFor());
      await pagina.getByRole('tab', { name: 'Relato e investigação' }).click();

      // status
      await pagina.getByLabel('Status', { exact: true }).selectOption('em_investigacao');
      await ok('status muda para Em investigação', () => pagina.getByText('Status alterado para Em investigação.').waitFor());

      // resolução
      await ok('formulário de resolução presente', () => pagina.getByRole('heading', { name: 'Registrar resolução' }).waitFor());
      await foto('caso-resolucao'); await medir('caso-resolucao'); await cortes('caso-resolucao');
      await pagina.getByRole('button', { name: 'Registrar resolução' }).click();
      await ok('resolver sem desfecho é recusado', () => pagina.locator('#erro-desfecho').waitFor());
      await pagina.getByLabel('situação solucionada', { exact: false }).check();
      await pagina.getByLabel('Providências').fill('Conversa com os envolvidos e com a família; acompanhamento semanal.');
      await pagina.getByRole('button', { name: 'Registrar resolução' }).click();
      await ok('caso resolvido sem resultado (resultado vazio aceito)', () => pagina.getByText('Caso resolvido.').first().waitFor());
      await ok('foco no título depois de resolver', () => pagina.waitForFunction(() => document.activeElement?.tagName === 'H1'));
      await pagina.waitForTimeout(300);
      await foto('caso-resolvido'); await medir('caso-resolvido'); await cortes('caso-resolvido');

      // pós-resolução
      await pagina.getByRole('button', { name: /^Pós-resolução/ }).click();
      await ok('pós-resolução lista o caso', async () => {
        await pagina.getByRole('heading', { name: 'O cuidado continua.' }).waitFor();
        await pagina.locator('.casos-linha', { hasText: `${marca} critico` }).waitFor();
      });
      await foto('pos'); await medir('pos'); await cortes('pos');

      // aluno diz que voltou
      await situacaoDoAluno(codCritico, 'voltou');
      await pagina.getByRole('button', { name: 'Visão geral' }).click();
      await ok('visão geral alerta a recorrência', () => pagina.getByRole('heading', { name: 'Um cuidado precisa ser retomado' }).waitFor());
      await ok('navegação mostra a contagem de pendentes', async () => {
        await pagina.locator('.nav-contagem').first().waitFor();
      });
      await pagina.waitForTimeout(300);
      await foto('geral-recorrencia'); await medir('geral-recorrencia'); await cortes('geral-recorrencia');
      await pagina.getByRole('button', { name: /^Abrir caso \d+$/ }).first().click();
      await ok('caso mostra o alerta de recorrência', () => pagina.getByRole('heading', { name: 'Situação voltou a acontecer' }).waitFor());
      await pagina.waitForTimeout(300);
      await foto('caso-recorrencia'); await medir('caso-recorrencia'); await cortes('caso-recorrencia');
      await foco('caso-recorrencia', 8);
      await pagina.getByRole('button', { name: 'Registrar revisão' }).click();
      await ok('revisão registrada', () => pagina.getByText('Revisão registrada.').waitFor());
      await ok('alerta de recorrência some depois da revisão', async () => {
        if (await pagina.getByRole('heading', { name: 'Situação voltou a acontecer' }).count()) throw new Error('alerta continua');
      });
      await foto('caso-revisado'); await medir('caso-revisado');
      await pagina.getByRole('button', { name: 'Reabrir para investigação' }).click();
      await ok('reabrir devolve o formulário de resolução', () => pagina.getByRole('heading', { name: 'Registrar resolução' }).waitFor());
      await foto('caso-reaberto'); await medir('caso-reaberto');

      // usuários (admin) e conta de coordenador
      await pagina.getByRole('button', { name: 'Usuários' }).click();
      await ok('usuários lista a própria conta sem desativar', () => pagina.getByText('Você não pode desativar a própria conta.').waitFor());
      const nomeCoord = `Coord ${marca}`;
      await pagina.getByLabel('Nome', { exact: true }).fill(nomeCoord);
      await pagina.getByLabel('Senha', { exact: true }).fill(senha);
      await pagina.getByRole('button', { name: 'Criar usuário' }).click();
      await ok('conta de coordenador criada', () => pagina.getByText(`Usuário ${nomeCoord} criado.`).waitFor());
      await foto('usuarios'); await medir('usuarios'); await cortes('usuarios'); await foco('usuarios', 8);
      await pagina.getByRole('button', { name: 'Sair' }).click();
      await pagina.getByRole('heading', { name: 'Portal da coordenação' }).waitFor();
      await pagina.getByLabel('Nome', { exact: true }).fill(nomeCoord);
      await pagina.getByLabel('Senha', { exact: true }).fill(senha);
      await pagina.getByRole('button', { name: 'Entrar' }).click();
      await pagina.getByRole('heading', { name: 'Cada pedido merece atenção.' }).waitFor();
      await ok('coordenador não vê Usuários', async () => {
        if (await pagina.getByRole('button', { name: 'Usuários' }).count()) throw new Error('item visível');
        await pagina.goto(`${coord}/#usuarios`);
        await pagina.getByRole('heading', { name: 'Novo usuário' }).waitFor({ timeout: 1500 }).then(() => { throw new Error('tela de usuários abriu'); }, () => {});
      });
      await foto('coordenador');
      await medir('coordenador');

      await pagina.getByRole('button', { name: 'Sair' }).click();
      await ok('sair volta ao login', () => pagina.getByRole('heading', { name: 'Portal da coordenação' }).waitFor());
      for (const r of respostasRuins) if (!esperadas.some(e => r.endsWith(e))) erros.push(`resposta inesperada ${r}`);
      } catch (falha) {
        problemas.push(`ABORTADO: ${String(falha.message ?? falha).split('\n')[0]}`);
        await foto('falha').catch(() => {});
      }
      const estilos = await pagina.evaluate(() => document.querySelectorAll('[style]').length).catch(() => -1);
      resultados.push({ nome, passos: passos.length, maiorExcessoHorizontal: maiorLargura, elementosComStyle: estilos, violacoesCsp: violacoes, errosConsole: erros, problemas });
      await contexto.close();
    }
  }
} finally { await navegador.close(); }
await writeFile(fileURLToPath(new URL('./resultado-coord.json', import.meta.url)), JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados, null, 2));
