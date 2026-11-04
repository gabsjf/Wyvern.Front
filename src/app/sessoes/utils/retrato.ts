/**
 * Prepara a imagem escolhida como retrato de token: recorta o quadrado central, reduz para `lado` pixels e
 * converte para WebP. Retratos pequenos carregam rápido e cabem folgados no limite do servidor (512 KB).
 */
export async function prepararRetrato(arquivo: File, lado = 256): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Não foi possível preparar a imagem.');

    const menor = Math.min(imagem.width, imagem.height);
    contexto.drawImage(imagem, (imagem.width - menor) / 2, (imagem.height - menor) / 2, menor, menor, 0, 0, lado, lado);

    const blob = await new Promise<Blob | null>(resolver => canvas.toBlob(resolver, 'image/webp', 0.85));
    if (!blob) throw new Error('Não foi possível preparar a imagem.');
    return blob;
  } finally {
    imagem.close();
  }
}
