export interface CompressImageOptions {
  maxSide?: number;
  quality?: number;
  maxLength?: number;
}

export function compressLocalImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const maxSide = options.maxSide ?? 512;
  const quality = options.quality ?? 0.82;
  const maxLength = options.maxLength ?? 350_000;

  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      reject(new Error('Format image non pris en charge (utilisez PNG, JPEG ou WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new window.Image();
      img.onerror = () => reject(new Error("Fichier image invalide ou corrompu."));
      img.onload = () => {
        const w0 = img.width || maxSide;
        const h0 = img.height || maxSide;
        const scale = Math.min(1, maxSide / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (rawDataUrl.length <= maxLength) {
            resolve(rawDataUrl);
          } else {
            reject(new Error('Image trop volumineuse (max 250 Ko).'));
          }
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/webp', quality);
        const finalUrl = compressed.startsWith('data:image/') ? compressed : rawDataUrl;
        if (finalUrl.length > maxLength) {
          reject(new Error('Image encore trop volumineuse après compression (max 250 Ko).'));
          return;
        }
        resolve(finalUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
