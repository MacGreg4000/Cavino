import type { FastifyInstance } from 'fastify';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://macciolupo.tplinkdns.com:11434';

export async function advisorRoutes(app: FastifyInstance) {
  // Vérifier la connexion Ollama
  app.get('/api/advisor/status', async () => {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models?: Array<{ name: string }> };
      return {
        online: true,
        models: data.models?.map((m: { name: string }) => m.name) || [],
      };
    } catch {
      return { online: false, models: [] };
    }
  });

  // Demander un conseil vin via Ollama
  app.post('/api/advisor/ask', async (req, reply) => {
    const { meal, tags, wines } = req.body as {
      meal: string;
      tags: string[];
      wines: Array<{ id: string; name: string; type: string; region?: string; appellation?: string; pairings?: any }>;
    };

    const wineList = wines
      .map((w, i) => `${i + 1}. ${w.name} (${w.type}${w.region ? `, ${w.region}` : ''}${w.appellation ? `, ${w.appellation}` : ''})`)
      .join('\n');

    const prompt = `Tu es un sommelier expert. L'utilisateur prépare ce repas : "${meal}"${tags.length > 0 ? ` (tags: ${tags.join(', ')})` : ''}.

Voici les vins disponibles dans sa cave :
${wineList}

Recommande les 3 meilleurs accords en expliquant pourquoi. Réponds en français, format JSON :
[{"id": "wine_id", "score": 95, "reason": "explication courte"}]

Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3:8b',
          prompt,
          stream: false,
          options: { temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        return reply.status(502).send({ error: 'Ollama non disponible' });
      }

      const data = await res.json() as { response: string };

      // Extraire le JSON de la réponse
      let recommendations: Array<{ id: string; score: number; reason: string }> = [];
      try {
        const jsonMatch = data.response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          recommendations = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Si le parsing échoue, retourner la réponse brute
        return { raw: data.response, recommendations: [] };
      }

      return { recommendations };
    } catch {
      return reply.status(502).send({ error: 'Ollama non disponible ou timeout' });
    }
  });
}
