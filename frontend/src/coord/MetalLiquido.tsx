import { useEffect, useId, useRef, useState } from 'react';

export default function MetalLiquido() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [pausado, setPausado] = useState(false);
  const [visivel, setVisivel] = useState(!document.hidden);
  const superficie = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let naTela = true;
    const atualizar = () => setVisivel(naTela && !document.hidden);
    document.addEventListener('visibilitychange', atualizar);
    const observador = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entrada]) => {
      naTela = entrada.isIntersecting; atualizar();
    });
    if (superficie.current) observador?.observe(superficie.current);
    return () => { document.removeEventListener('visibilitychange', atualizar); observador?.disconnect(); };
  }, []);
  return <>
    <div ref={superficie} className="metal-liquido" aria-hidden="true" data-pausado={pausado || !visivel}>
      <svg viewBox="0 0 248 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-cromo`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f9fcff" /><stop offset=".18" stopColor="#a8b5c5" />
            <stop offset=".36" stopColor="#ffffff" /><stop offset=".48" stopColor="#667487" />
            <stop offset=".58" stopColor="#dae3ec" /><stop offset=".76" stopColor="#8796a8" />
            <stop offset="1" stopColor="#f2f7fd" />
          </linearGradient>
          <filter id={`${id}-fusion`} x="-60%" y="-40%" width="220%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="flou" />
            <feColorMatrix in="flou" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="fusion" />
            <feSpecularLighting in="fusion" surfaceScale="7" specularConstant="1.2" specularExponent="28" lightingColor="#ffffff" result="reflet">
              <fePointLight x="-80" y="-100" z="240" />
            </feSpecularLighting>
            <feComposite in="reflet" in2="fusion" operator="in" result="brilho" />
            <feBlend in="fusion" in2="brilho" mode="screen" />
          </filter>
        </defs>
        <g filter={`url(#${id}-fusion)`} fill={`url(#${id}-cromo)`}>
          <ellipse className="metal-bolha metal-bolha-1" cx="20" cy="190" rx="96" ry="140" />
          <ellipse className="metal-bolha metal-bolha-2" cx="208" cy="340" rx="100" ry="128" />
          <ellipse className="metal-bolha metal-bolha-3" cx="44" cy="620" rx="110" ry="135" />
          <ellipse className="metal-bolha metal-bolha-4" cx="220" cy="825" rx="85" ry="122" />
        </g>
      </svg>
    </div>
    <button type="button" className="metal-pausa" aria-pressed={pausado} onClick={() => setPausado(!pausado)}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d={pausado ? 'M4 2l9 6-9 6z' : 'M3 2h3v12H3z M10 2h3v12h-3z'} />
      </svg><span className="metal-pausa-texto">{pausado ? 'Retomar efeito' : 'Pausar efeito'}</span>
    </button>
  </>;
}
