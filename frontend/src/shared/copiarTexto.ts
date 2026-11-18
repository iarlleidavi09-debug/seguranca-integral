export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* HTTP na rede local pode bloquear a Clipboard API. */ }

  const foco = document.activeElement;
  const selecao = window.getSelection();
  const intervalos = selecao ? Array.from({ length: selecao.rangeCount }, (_, i) => selecao.getRangeAt(i).cloneRange()) : [];
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.readOnly = true;
  campo.className = 'copia-temporaria';
  campo.setAttribute('aria-label', 'Código para copiar');
  document.body.append(campo);
  try {
    campo.focus({ preventScroll: true });
    campo.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch { return false; }
  finally {
    campo.remove();
    if (foco instanceof HTMLElement && foco.isConnected) foco.focus({ preventScroll: true });
    if (selecao) {
      selecao.removeAllRanges();
      for (const intervalo of intervalos) selecao.addRange(intervalo);
    }
  }
}
