const LIMITE = 5 * 1024 * 1024;

// Gira a imagem no navegador antes do envio. O servidor remove a orientação EXIF,
// então o aluno corrige aqui as fotos que aparecem deitadas.
export async function girarImagem(arquivo: File, graus: 90 | 180 | 270): Promise<File> {
  if (arquivo.type === 'image/gif' || typeof createImageBitmap !== 'function') throw new Error('girar-indisponivel');
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(arquivo);
    const canvas = document.createElement('canvas');
    const lado = graus !== 180;
    canvas.width = lado ? bitmap.height : bitmap.width;
    canvas.height = lado ? bitmap.width : bitmap.height;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('sem canvas');
    contexto.translate(canvas.width / 2, canvas.height / 2);
    contexto.rotate((graus * Math.PI) / 180);
    contexto.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise<Blob | null>(resolver => canvas.toBlob(resolver, arquivo.type));
    if (!blob) throw new Error('sem blob');
    if (blob.size > LIMITE) throw new Error('girar-grande');
    return new File([blob], arquivo.name, { type: arquivo.type, lastModified: arquivo.lastModified });
  } catch (falha) {
    if (falha instanceof Error && falha.message === 'girar-grande') throw falha;
    throw new Error('girar-indisponivel');
  } finally {
    bitmap?.close?.();
  }
}
