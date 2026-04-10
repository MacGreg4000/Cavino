import type { FastifyInstance } from 'fastify';

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://host.docker.internal:11434';
const SEARXNG_URL  = process.env.SEARXNG_URL  || 'http://host.docker.internal:8888';
const CHAT_MODEL   = process.env.CHAT_MODEL   || 'qwen3:8b';
const VISION_MODEL = process.env.VISION_MODEL || 'qwen2.5vl:7b';

// ─── SearXNG web search ───────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  content?: string;
}

async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `${SEARXNG_URL}/search?` + new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
        language: 'fr',
      }),
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { results?: SearchResult[] };
    return (data.results || []).slice(0, maxResults).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content ? r.content.slice(0, 200) : '',
    }));
  } catch {
    return [];
  }
}

// Détecte si la question nécessite une recherche web (achat, prix, site...)
function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    'acheter', 'commander', 'commande', 'prix', 'boutique', 'site', 'shop',
    'trouver', 'où', 'disponible', 'vente', 'idéalwine', 'millesima',
    'caveavin', 'vinatis', 'wine searcher', 'livraison', 'stock',
  ];
  return keywords.some((k) => lower.includes(k));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function advisorRoutes(app: FastifyInstance) {

  // Statut Ollama
  app.get('/api/advisor/status', async () => {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models?: Array<{ name: string }> };
      return { online: true, models: data.models?.map((m) => m.name) || [] };
    } catch {
      return { online: false, models: [] };
    }
  });

  // POST /api/chat — chatbot multimodal (texte + photo optionnelle)
  app.post('/api/chat', async (req, reply) => {
    const parts = req.parts();

    let messagesRaw = '[]';
    let imageB64: string | null = null;
    let imageMime = 'image/jpeg';

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'messages') {
        messagesRaw = part.value as string;
      } else if (part.type === 'file' && part.fieldname === 'image') {
        const buf = await part.toBuffer();
        imageB64 = buf.toString('base64');
        imageMime = part.mimetype || 'image/jpeg';
      }
    }

    let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      messages = JSON.parse(messagesRaw);
    } catch {
      return reply.status(400).send({ error: 'Messages invalides' });
    }

    if (messages.length === 0) {
      return reply.status(400).send({ error: 'Aucun message' });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const hasImage = !!imageB64;
    const searchNeeded = needsWebSearch(lastUserMessage);

    // Recherche web si nécessaire
    let searchContext = '';
    let searchResults: SearchResult[] = [];
    if (searchNeeded) {
      // Construire une query pertinente depuis le dernier message
      const query = lastUserMessage.replace(/[?!]/g, ' ').trim();
      searchResults = await webSearch(query);
      if (searchResults.length > 0) {
        searchContext = '\n\nRésultats de recherche web :\n' +
          searchResults.map((r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content || ''}`
          ).join('\n\n');
      }
    }

    // Prompt système
    const systemPrompt = `Tu es Cavino, un assistant sommelier expert intégré dans une application de gestion de cave à vin.
Tu réponds TOUJOURS en français, de manière concise et précise.
Tu peux :
- Identifier des vins depuis des photos d'étiquettes
- Répondre à toute question sur les vins (accord mets-vins, service, garde, dégustation, régions...)
- Aider à trouver où acheter un vin en citant des liens concrets quand tu as des résultats de recherche
- Donner des conseils personnalisés

Si on te demande où acheter, cite les URLs trouvées dans les résultats de recherche.
Réponds de façon naturelle et conversationnelle. Pas de markdown excessif.${searchContext}`;

    const model = hasImage ? VISION_MODEL : CHAT_MODEL;

    // Construction des messages Ollama
    const ollamaMessages: Array<{
      role: string;
      content: string;
      images?: string[];
    }> = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Dernier message user avec image optionnelle
    const lastUserMsg: { role: string; content: string; images?: string[] } = {
      role: 'user',
      content: lastUserMessage,
    };
    if (imageB64) {
      lastUserMsg.images = [imageB64];
    }
    ollamaMessages.push(lastUserMsg);

    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          think: false,
          stream: false,
          options: { temperature: 0.5, num_ctx: 8192 },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[advisor] Ollama /api/chat HTTP ${res.status}: ${errText}`);
        return reply.status(502).send({ error: `Ollama erreur ${res.status}` });
      }

      const data = await res.json() as { message?: { content: string }; response?: string; error?: string };

      if (data.error) {
        console.error(`[advisor] Ollama error field: ${data.error}`);
        return reply.status(502).send({ error: data.error });
      }

      const content = data.message?.content || data.response || '';

      // Supprimer les blocs <think>...</think> (qwen3)
      const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      return {
        content: clean,
        sources: searchResults.length > 0 ? searchResults : undefined,
        model,
      };
    } catch (err) {
      console.error('[advisor] fetch error:', err);
      return reply.status(502).send({ error: `Ollama non disponible ou timeout: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
}
