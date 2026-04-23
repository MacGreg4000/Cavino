import type { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function scanRoutes(app: FastifyInstance) {
  // POST /api/scan/upload — Upload recto (+ optional verso) to inbox for analysis
  //
  // IMPORTANT — Drop atomique :
  // On écrit d'abord TOUS les fichiers dans un dossier de staging (.staging/<basename>)
  // situé HORS du répertoire surveillé par le watcher Python, puis on fait un rename()
  // de chaque fichier vers `A analyser/` à la fin. Les renames sont quasi-instantanés
  // (opération de métadonnée dans le même volume) donc recto + verso apparaissent dans
  // le watch en quelques ms — bien en dessous de SETTLE=3s.
  //
  // Sans ce staging, sur upload lent (HEIC iPhone 5–10 MB/photo en wifi faible), le
  // délai entre `fs.writeFile(recto)` et `fs.writeFile(verso)` pouvait dépasser SETTLE,
  // ce qui provoquait DEUX cycles `_flush` distincts côté watcher Python → DEUX appels
  // Ollama pour le même scan_id, et souvent un échec sur le verso seul.
  app.post('/api/scan/upload', async (req, reply) => {
    const inboxPath = process.env.INBOX_PATH || '/inbox';
    const scanDir = path.join(inboxPath, 'A analyser');
    const basename = `scan_${new Date().toISOString().slice(0, 10)}_${crypto.randomUUID().slice(0, 8)}`;
    const stagingDir = path.join(inboxPath, '.staging', basename);

    await fs.mkdir(scanDir, { recursive: true });
    await fs.mkdir(stagingDir, { recursive: true });

    const parts = req.parts();

    type StagedFile = { stagedPath: string; finalName: string };
    const staged: StagedFile[] = [];
    let hintStagedPath: string | null = null;
    let hintFinalName: string | null = null;
    let rectoSaved = false;
    let versoSaved = false;

    try {
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'hint') {
          const hintText = (part as unknown as { value: string }).value?.trim();
          if (hintText) {
            hintFinalName = `${basename}_hint.txt`;
            hintStagedPath = path.join(stagingDir, hintFinalName);
            await fs.writeFile(hintStagedPath, hintText, 'utf8');
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

        const finalName = `${basename}${suffix}${ext}`;
        const stagedPath = path.join(stagingDir, finalName);
        const buffer = await part.toBuffer();
        await fs.writeFile(stagedPath, buffer);
        staged.push({ stagedPath, finalName });
      }

      if (!rectoSaved) {
        // Nettoyage du staging avant de rejeter
        for (const s of staged) await fs.unlink(s.stagedPath).catch(() => {});
        if (hintStagedPath) await fs.unlink(hintStagedPath).catch(() => {});
        await fs.rmdir(stagingDir).catch(() => {});
        return reply.status(400).send({ error: 'La photo recto est requise' });
      }

      // Drop atomique : on déplace le hint EN PREMIER (pas surveillé par le watcher
      // car .txt), puis le verso, puis le recto. Ça garantit qu'au moment où le
      // watcher détecte le recto (_1), le verso (_2) est déjà présent sur disque,
      // donc group_photos les appariera bien ensemble dans un seul process_group.
      if (hintStagedPath && hintFinalName) {
        await fs.rename(hintStagedPath, path.join(scanDir, hintFinalName));
      }
      // Trier : _2 (verso) d'abord, _1 (recto) ensuite — le recto déclenche le SETTLE.
      const orderedMoves = [...staged].sort((a, b) => {
        const aIsRecto = a.finalName.includes('_1.');
        const bIsRecto = b.finalName.includes('_1.');
        if (aIsRecto === bIsRecto) return 0;
        return aIsRecto ? 1 : -1; // recto à la fin
      });
      for (const s of orderedMoves) {
        await fs.rename(s.stagedPath, path.join(scanDir, s.finalName));
      }
      await fs.rmdir(stagingDir).catch(() => {});

      return { ok: true, scanId: basename, verso: versoSaved };
    } catch (err) {
      // Nettoyage sur erreur — on évite de laisser du staging orphelin
      for (const s of staged) await fs.unlink(s.stagedPath).catch(() => {});
      if (hintStagedPath) await fs.unlink(hintStagedPath).catch(() => {});
      await fs.rmdir(stagingDir).catch(() => {});
      throw err;
    }
  });
}
