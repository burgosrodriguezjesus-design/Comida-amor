// Reduce las fotos en el propio dispositivo antes de subirlas:
// se suben más rápido, ocupan menos y se eliminan los metadatos (p. ej. la ubicación GPS).

async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* se prueba con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(source: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', quality);
  });
}

export async function prepareImage(file: File) {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadImage(file);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con otra foto (JPEG o PNG).');
  }
  const full = await render(source, 1600, 0.82);
  const thumb = await render(source, 480, 0.74);
  if ('close' in source) source.close();
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
