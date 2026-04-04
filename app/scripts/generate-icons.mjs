/**
 * Génère les PNG d’icônes PWA / iOS à partir de public/favicon.svg
 * Exécuter : node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = join(__dirname, '../public');
const svg = readFileSync(join(pub, 'favicon.svg'));

const outputs = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

for (const [filename, size] of outputs) {
  await sharp(svg).resize(size, size).png().toFile(join(pub, filename));
  console.log('wrote', filename);
}
