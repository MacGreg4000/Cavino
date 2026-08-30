/** Taille max acceptée pour une photo encodée en base64 (~15 Mo décodés). */
export const MAX_IMPORTED_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Convertit une data URI (`photo.dataUrl` d'un `WineImportFile`) en `File`,
 * réutilisable tel quel avec l'endpoint multipart existant
 * `POST /api/wines/:id/photo` — même technique que `AddWineManual.tsx`
 * (qui fait l'inverse : `File` → data URI via `FileReader.readAsDataURL`).
 *
 * Lève une erreur si la data URI est malformée ou dépasse la taille max.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1 || !dataUrl.startsWith('data:image/')) {
    throw new Error('Data URI de photo invalide');
  }

  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';

  // Estimation rapide de la taille décodée avant de faire le travail d'atob.
  const estimatedBytes = (base64.length * 3) / 4;
  if (estimatedBytes > MAX_IMPORTED_PHOTO_BYTES) {
    throw new Error('Photo trop volumineuse');
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Data URI de photo invalide (base64 corrompu)');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new File([bytes], filename || 'photo.jpg', { type: mime });
}
