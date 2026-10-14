import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap(nome => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}
const fonte = arquivos('src').filter(f => /\.(tsx?|css)$/.test(f) && !/\.test\.|[\/]test[\/]/.test(f));

describe('Compatibilidade com a CSP do servidor', () => {
  it.each([
    ['atributo style', /\bstyle\s*=/],
    ['elemento style', /<style\b/i],
    ['script inline', /<script\b(?![^>]*\bsrc=)/i],
    ['eval', /\beval\s*\(/],
    ['new Function', /new\s+Function\b/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['URL absoluta', /https?:\/\//],
    ['Google Fonts', /fonts\.(googleapis|gstatic)/],
    ['travessão longo', /[–—]/],
  ])('o código-fonte não usa %s', (_nome, padrao) => {
    for (const arquivo of fonte) expect(readFileSync(arquivo, 'utf8'), arquivo).not.toMatch(padrao);
  });
  it('o index.html de origem e o gerado não têm script nem estilo inline', () => {
    for (const caminho of ['index.html', 'coordenacao.html', '../backend/app/static/aluno/index.html', '../backend/app/static/coordenacao/index.html']) {
      if (!existsSync(caminho)) continue;
      const html = readFileSync(caminho, 'utf8');
      expect(html, caminho).not.toMatch(/<style\b|\sstyle=|<script\b(?![^>]*\bsrc=)|https?:\/\//i);
    }
  });
});
