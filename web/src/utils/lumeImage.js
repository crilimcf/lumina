/** Normalize native camera photos to the same compact square JPEG used
 * by the browser Lume camera. The upload API accepts JPEG and limits images
 * to 8 MiB; iOS originals can be HEIC or substantially larger.
 * All processing stays on-device; nothing is sent until the user publishes.
 */
export async function prepareLumePhoto(blob, { size = 1080, quality = 0.88 } = {}) {
  if (!(blob instanceof Blob) || blob.size === 0 || !String(blob.type).startsWith('image/')) {
    throw new Error('Ficheiro de fotografia inválido');
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('Fotografia sem dimensões válidas');

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A conversão da fotografia não é suportada');
    const side = Math.min(width, height);
    ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);

    const jpeg = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível converter a fotografia')), 'image/jpeg', quality);
    });
    if (jpeg.type !== 'image/jpeg' || jpeg.size > 8 * 1024 * 1024) {
      throw new Error('Não foi possível preparar uma fotografia JPEG com tamanho permitido');
    }
    return new File([jpeg], `lume-${Date.now()}.jpg`, { type:'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
