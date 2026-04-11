import type { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function scanRoutes(app: FastifyInstance) {
  // POST /api/scan/upload — Upload recto (+ optional verso) to inbox for analysis
  app.post('/api/scan/upload', async (req, reply) => {
    const inboxPath = process.env.INBOX_PATH || '/inbox';
    const scanDir = path.join(inboxPath, 'A analyser');
    await fs.mkdir(scanDir, { recursive: true });

    const parts = req.parts();
    const basename = `scan_${new Date().toISOString().slice(0, 10)}_${crypto.randomUUID().slice(0, 8)}`;

    let rectoSaved = false;
    let versoSaved = false;

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'hint') {
        const hintText = (part as unknown as { value: string }).value?.trim();
        if (hintText) {
          await fs.writeFile(path.join(scanDir, `${basename}_hint.txt`), hintText, 'utf8');
        }
        continue;
      }

      if (part.type !== 'file') continue;

      const ext = path.extname(part.filename || '').toLowerCase() || '.jpg';
      let suffix: string;

      if (part.fieldname === 'recto') {
        suffix = '_1';
        rectoSaved = true;
      } else if (part.fieldname === 'verso') {
        suffix = '_2';
        versoSaved = true;
      } else {
        continue;
      }

      const filename = `${basename}${suffix}${ext}`;
      const filepath = path.join(scanDir, filename);
      const buffer = await part.toBuffer();
      await fs.writeFile(filepath, buffer);
    }

    if (!rectoSaved) {
      return reply.status(400).send({ error: 'La photo recto est requise' });
    }

    return { ok: true, scanId: basename, verso: versoSaved };
  });
}
