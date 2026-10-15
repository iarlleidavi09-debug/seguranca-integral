// Mede o contraste WCAG (luminância relativa) dos pares de cores de src/shared/tema.css.
// Uso: node verificacao/contraste.mjs [--tabela]   (sai com código 1 se algum par falhar)
// Texto precisa de 4,5:1; bordas, ícones, pontos e anel de foco precisam de 3:1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/shared/tema.css', import.meta.url)), 'utf8');
const inicioEscuro = css.indexOf('@media (prefers-color-scheme: dark)');
const blocoClaro = css.slice(0, inicioEscuro);
const blocoEscuro = css.slice(inicioEscuro, css.indexOf('* { box-sizing'));
const ler = bloco => Object.fromEntries([...bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(m => [m[1], m[2]]));
const claro = ler(blocoClaro);
const temaAluno = { claro, escuro: { ...claro, ...ler(blocoEscuro) } };

// Tema da coordenação: o bloco .coord-app (claro) e o do @media escuro, em src/coord/coord.css.
const cssCoord = readFileSync(fileURLToPath(new URL('../src/coord/coord.css', import.meta.url)), 'utf8');
const iniEscuroCoord = cssCoord.indexOf('@media (prefers-color-scheme: dark)');
const coordClaro = ler(cssCoord.slice(0, iniEscuroCoord));
const fimTokens = cssCoord.indexOf('/* fim dos tokens do tema */');
if (iniEscuroCoord < 0 || fimTokens < 0) throw new Error('coord.css: faltam o bloco escuro ou o marcador "/* fim dos tokens do tema */".');
const coordEscuro = ler(cssCoord.slice(iniEscuroCoord, fimTokens));
// o escuro precisa redefinir tudo que o claro redefine, senão o claro vazaria para o escuro
const faltando = Object.keys(coordClaro).filter(k => !(k in coordEscuro));
if (faltando.length) { console.log(`FALHA: tokens do .coord-app sem versão escura: ${faltando.join(', ')}`); process.exit(1); }
const temaCoord = {
  claro: { ...temaAluno.claro, ...coordClaro },
  escuro: { ...temaAluno.escuro, ...coordEscuro },
};
const temas = { claro: temaAluno.claro, escuro: temaAluno.escuro, 'coord claro': temaCoord.claro, 'coord escuro': temaCoord.escuro };

const canal = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luz = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255); };
const razao = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const T = 4.5, G = 3;
const fundos = ['fundo-base', 'fundo-superficie', 'fundo-superficie-2'];
const pares = [
  ...fundos.flatMap(f => [['texto-principal', f, T], ['texto-secundario', f, T], ['primaria-base', f, T], ['perigo-base', f, T], ['borda-forte', f, G], ['foco-anel', f, G]]),
  ['texto-sobre-primaria', 'primaria-base', T], ['texto-sobre-primaria', 'primaria-hover', T],
  ['texto-sobre-perigo', 'perigo-base', T],
  ['texto-principal', 'primaria-suave', T], ['texto-secundario', 'primaria-suave', T], ['primaria-base', 'primaria-suave', T],
  ['perigo-base', 'perigo-suave', T], ['texto-principal', 'perigo-suave', T],
  ['aviso-texto', 'aviso-fundo', T], ['sucesso-texto', 'sucesso-fundo', T], ['info-texto', 'info-fundo', T],
  ['gravidade-alta-texto', 'gravidade-alta-fundo', T], ['gravidade-media-texto', 'gravidade-media-fundo', T], ['gravidade-baixa-texto', 'gravidade-baixa-fundo', T],
  ['gravidade-alta-borda', 'gravidade-alta-fundo', G], ['gravidade-media-borda', 'gravidade-media-fundo', G], ['gravidade-baixa-borda', 'gravidade-baixa-fundo', G],
  ['gravidade-alta-borda', 'fundo-superficie', G], ['gravidade-media-borda', 'fundo-superficie', G], ['gravidade-baixa-borda', 'fundo-superficie', G],
  ['texto-principal', 'gravidade-alta-fundo', T], ['texto-secundario', 'gravidade-alta-fundo', T],
  ['foco-anel', 'gravidade-alta-fundo', G], ['foco-anel', 'primaria-suave', G],
  ['simulacao-texto', 'simulacao-fundo', T],
  ['simulacao-fundo', 'fundo-superficie', G], ['simulacao-fundo', 'gravidade-alta-fundo', G],
  ['desabilitado-texto', 'desabilitado-fundo', T],
  ...['novo', 'em-analise', 'aguardando', 'encaminhado', 'resolvido'].flatMap(s => [[`status-${s}`, 'fundo-superficie', G], [`status-${s}`, 'fundo-superficie-2', G]]),
];

// pares novos, medidos só nos temas da coordenação
const prioridades = ['critica', 'alta', 'media', 'baixa'];
const nomeToken = p => (p === 'critica' ? `prioridade-${p}` : `gravidade-${p}`);
const paresCoord = [
  ...prioridades.flatMap(p => {
    const t = nomeToken(p);
    return [
      [`${t}-texto`, `${t}-fundo`, T], [`${t}-borda`, `${t}-fundo`, G], [`${t}-borda`, 'fundo-superficie', G], [`${t}-borda`, 'fundo-base', G],
      [`${t}-texto`, 'fundo-superficie', T], [`${t}-texto`, 'fundo-base', T],
      [`foco-anel`, `${t}-fundo`, G], ['texto-principal', `${t}-fundo`, T], ['texto-secundario', `${t}-fundo`, T],
    ];
  }),
  // o "!" do octógono da prioridade crítica é desenhado com a cor da superfície sobre o preenchimento do selo
  ['fundo-superficie', 'prioridade-critica-texto', G],
  ['recorrencia-texto', 'recorrencia-fundo', T], ['recorrencia-borda', 'recorrencia-fundo', G], ['recorrencia-borda', 'fundo-base', G],
  ['foco-anel', 'recorrencia-fundo', G], ['texto-principal', 'recorrencia-fundo', T], ['texto-secundario', 'recorrencia-fundo', T],
  ['primaria-base', 'primaria-suave', T], ['texto-secundario', 'primaria-suave', T], ['texto-principal', 'primaria-suave', T],
  ['texto-sobre-primaria', 'primaria-base', T], ['texto-sobre-primaria', 'primaria-hover', T],
  ...['novo', 'em-investigacao', 'resolvido'].flatMap(s => [[`status-${s}`, 'fundo-superficie', G], [`status-${s}`, 'fundo-superficie-2', G], [`status-${s}`, 'fundo-base', G]]),
  ['foco-anel', 'fundo-superficie-2', G], ['foco-anel', 'fundo-base', G], ['foco-anel', 'fundo-superficie', G],
  ['texto-secundario', 'fundo-superficie-2', T], ['texto-principal', 'fundo-superficie-2', T],
  ['borda-forte', 'fundo-superficie-2', G], ['borda-forte', 'fundo-superficie', G], ['borda-forte', 'fundo-base', G],
  ['primaria-base', 'fundo-superficie-2', T],
];

const linhas = [];
let falhas = 0;
for (const [nome, cores] of Object.entries(temas)) {
  const doCoord = nome.startsWith('coord');
  for (const [a, b, minimo] of doCoord ? [...pares, ...paresCoord] : pares) {
    const r = razao(cores[a], cores[b]);
    const passou = r >= minimo;
    if (!passou) falhas += 1;
    linhas.push({ tema: nome, a, b, ra: cores[a], rb: cores[b], r, minimo, passou });
  }
}
if (process.argv.includes('--tabela')) {
  console.log('| Par (primeiro plano sobre fundo) | Mínimo | Claro | Escuro |\n| --- | --- | --- | --- |');
  for (const [a, b, minimo] of [...pares, ...paresCoord]) {
    const c = linhas.find(l => l.tema.endsWith('claro') && l.tema !== (paresCoord.some(p => p[0] === a && p[1] === b) ? 'claro' : 'coord claro') && l.a === a && l.b === b);
    const e = linhas.find(l => l.tema.endsWith('escuro') && l.tema !== (paresCoord.some(p => p[0] === a && p[1] === b) ? 'escuro' : 'coord escuro') && l.a === a && l.b === b);
    const f = l => `${l.r.toFixed(2)}${l.passou ? '' : ' FALHA'}`;
    console.log(`| ${a} sobre ${b} | ${minimo}:1 | ${f(c)} | ${f(e)} |`);
  }
} else {
  for (const l of linhas.filter(x => !x.passou)) console.log(`FALHA ${l.tema}: ${l.a} (${l.ra}) sobre ${l.b} (${l.rb}) = ${l.r.toFixed(2)} (mínimo ${l.minimo})`);
  console.log(`${linhas.length} medições, ${falhas} falhas.`);
}
process.exit(falhas ? 1 : 0);
