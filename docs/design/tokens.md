# Tokens de design: Segurança Integral v1

Fonte: arquivo Figma `in0L4M1kTj7VeT3kGrw8CP`, coleções `Tema Claro`, `Tema Escuro` e `Medidas`.

O plano Starter do Figma permite um modo por coleção. Por isso o tema escuro é uma
coleção separada (`Tema Escuro`) com os mesmos nomes de variável da `Tema Claro`.
No CSS, os dois temas viram o mesmo conjunto de propriedades customizadas, trocadas
por `[data-theme]` ou `prefers-color-scheme`.

## Paleta

Petróleo sobre areia: o verde-azulado escuro passa calma e seriedade sem lembrar
polícia (azul saturado) nem o gradiente azul-roxo genérico, e o fundo areia é mais
acolhedor que o branco puro.

## Cores

| Token | CSS | Claro | Escuro |
| --- | --- | --- | --- |
| fundo/base | `--fundo-base` | #F5F3EE | #101513 |
| fundo/superficie | `--fundo-superficie` | #FFFFFF | #181F1D |
| fundo/superficie-2 | `--fundo-superficie-2` | #ECE9E2 | #222A27 |
| texto/principal | `--texto-principal` | #1A2321 | #E8ECEA |
| texto/secundario | `--texto-secundario` | #4D5955 | #A8B3AF |
| texto/sobre-primaria | `--texto-sobre-primaria` | #FFFFFF | #0C211E |
| texto/sobre-perigo | `--texto-sobre-perigo` | #FFFFFF | #2B0C09 |
| borda/suave | `--borda-suave` | #DCD7CD | #2E3734 |
| borda/forte | `--borda-forte` | #7B8681 | #6F7B77 |
| primaria/base | `--primaria-base` | #1F5C56 | #7FC9BF |
| primaria/hover | `--primaria-hover` | #174A45 | #9AD6CD |
| primaria/suave | `--primaria-suave` | #E2EEEB | #1C3431 |
| foco/anel | `--foco-anel` | #2F5BD3 | #93ABFF |
| perigo/base | `--perigo-base` | #A1302A | #F08C82 |
| perigo/suave | `--perigo-suave` | #FBEAE7 | #3A1B18 |
| aviso/texto | `--aviso-texto` | #7A4A00 | #F0C674 |
| aviso/fundo | `--aviso-fundo` | #FBF0D9 | #33280F |
| sucesso/texto | `--sucesso-texto` | #2C6633 | #8FD19A |
| sucesso/fundo | `--sucesso-fundo` | #E4F1E5 | #17301B |
| info/texto | `--info-texto` | #24507A | #9EC2E6 |
| info/fundo | `--info-fundo` | #E6EEF6 | #18283A |
| gravidade/alta-texto | `--gravidade-alta-texto` | #9A2B25 | #F7AAA2 |
| gravidade/alta-fundo | `--gravidade-alta-fundo` | #FBE8E5 | #3B1C19 |
| gravidade/alta-borda | `--gravidade-alta-borda` | #C2453C | #D2645A |
| gravidade/media-texto | `--gravidade-media-texto` | #7D4E00 | #F1C46E |
| gravidade/media-fundo | `--gravidade-media-fundo` | #FCEFD6 | #35290F |
| gravidade/media-borda | `--gravidade-media-borda` | #B87A12 | #B98A2E |
| gravidade/baixa-texto | `--gravidade-baixa-texto` | #2F5370 | #A9C6DE |
| gravidade/baixa-fundo | `--gravidade-baixa-fundo` | #E7EEF4 | #1B2A36 |
| gravidade/baixa-borda | `--gravidade-baixa-borda` | #6D8BA4 | #6F8FA8 |
| status/novo | `--status-novo` | #3559A6 | #8EA8F0 |
| status/em-analise | `--status-em-analise` | #1F5C56 | #7FC9BF |
| status/aguardando | `--status-aguardando` | #6E5B9A | #B7A6E6 |
| status/encaminhado | `--status-encaminhado` | #4D5955 | #A8B3AF |
| status/resolvido | `--status-resolvido` | #2C6633 | #8FD19A |
| simulacao/fundo | `--simulacao-fundo` | #33304A | #D9D4F2 |
| simulacao/texto | `--simulacao-texto` | #FFFFFF | #1C1A2E |
| desabilitado/fundo | `--desabilitado-fundo` | #E4E1DA | #262E2B |
| desabilitado/texto | `--desabilitado-texto` | #56615D | #8C9793 |

Regras de uso:

- Gravidade nunca só por cor: chip com ícone (alta: triângulo, média: círculo com
  exclamação, baixa: seta para baixo) e texto "Gravidade alta/média/baixa".
- Chip de status é neutro (`fundo/superficie-2` + `texto/principal`); a cor de status
  fica só no ícone, para não competir com a gravidade.
- Selo de simulação usa fundo escuro invertido, distinto de qualquer chip.

## Contraste verificado (WCAG 2.1)

Todos os pares de texto passam 4.5:1 nos dois temas (texto sobre fundo, superfície,
superfície-2 e primária-suave; texto sobre primária e perigo; texto dos chips de
gravidade, avisos e selo). Bordas de campo, anel de foco, faixas de gravidade e ícones
de status passam 3:1. Menor valor medido: `borda/forte` sobre `fundo/base` no claro,
3.40:1 (exigência 3:1). `desabilitado/texto` foi escurecido de #5E6965 para #56615D
para chegar a 4.5:1 no claro.

## Espaçamento (coleção Medidas)

| Token | CSS | Valor |
| --- | --- | --- |
| espaco/1 | `--espaco-1` | 4px |
| espaco/2 | `--espaco-2` | 8px |
| espaco/3 | `--espaco-3` | 12px |
| espaco/4 | `--espaco-4` | 16px |
| espaco/5 | `--espaco-5` | 20px |
| espaco/6 | `--espaco-6` | 24px |
| espaco/8 | `--espaco-8` | 32px |
| espaco/10 | `--espaco-10` | 40px |
| espaco/12 | `--espaco-12` | 48px |
| espaco/16 | `--espaco-16` | 64px |

## Raios

| Token | CSS | Valor |
| --- | --- | --- |
| raio/sm | `--raio-sm` | 6px |
| raio/md | `--raio-md` | 10px |
| raio/lg | `--raio-lg` | 16px |
| raio/pill | `--raio-pill` | 999px |

## Controles e linhas

| Token | CSS | Valor | Uso |
| --- | --- | --- | --- |
| controle/altura | `--controle-altura` | 48px | altura mínima de botões e campos |
| controle/altura-min | `--controle-altura-min` | 44px | menor alvo de toque permitido |
| controle/icone | `--controle-icone` | 20px | ícone padrão |
| linha/fina | `--linha-fina` | 1px | bordas |
| linha/foco | `--linha-foco` | 3px | anel de foco, seleção, gravidade alta |

## Tipografia

Família única: **Atkinson Hyperlegible Next** (Google Fonts), fallback
`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Três pesos: 400, 600, 700.

| Estilo | Token de tamanho | Tamanho / altura de linha | Peso | Espaçamento |
| --- | --- | --- | --- | --- |
| Código | texto/codigo | 36 / 44 | 700 | 6px |
| Título grande | texto/titulo-lg | 30 / 38 | 700 | 0 |
| Título | texto/titulo | 24 / 32 | 600 | 0 |
| Título pequeno | texto/titulo-sm | 20 / 28 | 600 | 0 |
| Destaque | texto/destaque | 18 / 26 | 600 | 0 |
| Corpo | texto/corpo | 16 / 24 | 400 | 0 |
| Corpo forte | texto/corpo | 16 / 24 | 600 | 0 |
| Pequeno | texto/pequeno | 14 / 20 | 400 | 0 |
| Rótulo | texto/pequeno | 14 / 20 | 600 | 0 |
| Legenda | texto/legenda | 13 / 18 | 400 | 0 |

## Esboço em CSS

```css
:root {
  --fundo-base: #F5F3EE;
  --texto-principal: #1A2321;
  --primaria-base: #1F5C56;
  /* ...demais cores do tema claro conforme a tabela */
  --espaco-4: 16px;
  --raio-md: 10px;
  --controle-altura: 48px;
  --fonte: "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
[data-theme="escuro"] {
  --fundo-base: #101513;
  --texto-principal: #E8ECEA;
  --primaria-base: #7FC9BF;
  /* ...demais cores do tema escuro */
}
```
