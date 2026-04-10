import { useState, useRef, useEffect } from 'react';
import { Camera, Images, Send, Sparkles, X, ExternalLink, Wine, Loader } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { apiFetch } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  title: string;
  url: string;
  content?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  imagePreview?: string; // base64 preview pour affichage
  sources?: Source[];
  loading?: boolean;
}

// ─── Suggestions rapides ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Quel vin avec un magret de canard ?',
  'Comment servir un Sauternes ?',
  'Quelle est la différence entre Barolo et Barbaresco ?',
  'Où acheter du Château Pétrus ?',
];

// ─── Composants ───────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Wine size={14} className="text-accent-bright" />
        </div>
      )}

      <div className={`flex flex-col gap-1.5 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Image preview */}
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt=""
            className="w-32 h-40 object-cover rounded-[var(--radius-md)] border border-border"
          />
        )}

        {/* Bulle texte */}
        {(msg.content || msg.loading) && (
          <div className={`px-3 py-2.5 rounded-[var(--radius-lg)] text-sm leading-relaxed ${
            isUser
              ? 'bg-accent/20 border border-accent/30 text-text rounded-tr-sm'
              : 'bg-surface border border-border text-text rounded-tl-sm'
          }`}>
            {msg.loading ? (
              <div className="flex items-center gap-2 text-text-muted">
                <Loader size={13} className="animate-spin" />
                <span className="text-xs">Réflexion en cours…</span>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}
          </div>
        )}

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full">
            <p className="text-[10px] text-text-muted uppercase tracking-wide px-1">Sources</p>
            {msg.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-3 py-2 bg-surface border border-border rounded-[var(--radius-md)] hover:bg-surface-hover transition-colors"
              >
                <ExternalLink size={12} className="text-accent-bright flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text truncate">{s.title}</p>
                  <p className="text-[10px] text-text-muted truncate">{s.url}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Advisor ─────────────────────────────────────────────────────────────────

export function Advisor() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis Cavino, votre assistant sommelier. Posez-moi vos questions sur les vins, ou envoyez-moi la photo d\'une bouteille pour l\'identifier et trouver où l\'acheter.',
    },
  ]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingImage({ file, preview: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    if (sending) return;

    const userMessage: Message = {
      role: 'user',
      content: text || (pendingImage ? '(photo)' : ''),
      imagePreview: pendingImage?.preview,
    };

    const loadingMessage: Message = {
      role: 'assistant',
      content: '',
      loading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput('');
    const imageFile = pendingImage?.file ?? null;
    setPendingImage(null);
    setSending(true);

    try {
      // Historique sans le message loading
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const formData = new FormData();
      formData.append('messages', JSON.stringify(history));
      if (imageFile) formData.append('image', imageFile);

      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: formData,
        rawBody: true,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Erreur ${res.status}`);
      }

      const data = await res.json() as { content: string; sources?: Source[] };

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove loading
        { role: 'assistant', content: data.content, sources: data.sources },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: `Désolé, une erreur s'est produite : ${msg}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showSuggestions = messages.length === 1;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Conseiller" subtitle="Assistant sommelier IA" />

      {/* Zone messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full">

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {/* Suggestions rapides (état initial) */}
        {showSuggestions && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Suggestions</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="text-left text-xs px-3 py-2 rounded-[var(--radius-md)] bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Zone saisie */}
      <div className="border-t border-border bg-bg px-4 py-3 max-w-lg mx-auto w-full">

        {/* Preview image en attente */}
        {pendingImage && (
          <div className="relative w-16 h-20 mb-2">
            <img src={pendingImage.preview} alt="" className="w-full h-full object-cover rounded-[var(--radius-md)] border border-border" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
            >
              <X size={11} className="text-white" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Boutons photo */}
          <div className="flex gap-1.5 flex-shrink-0 pb-0.5">
            <button
              onClick={() => cameraRef.current?.click()}
              className="p-2 text-text-muted hover:text-text transition-colors"
              title="Appareil photo"
            >
              <Camera size={20} />
            </button>
            <button
              onClick={() => libraryRef.current?.click()}
              className="p-2 text-text-muted hover:text-text transition-colors"
              title="Bibliothèque"
            >
              <Images size={20} />
            </button>
          </div>

          {/* Input texte */}
          <div className="flex-1 bg-surface border border-border rounded-[var(--radius-lg)] px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question…"
              rows={1}
              className="w-full bg-transparent text-sm text-text placeholder:text-text-muted outline-none resize-none max-h-32"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          {/* Bouton envoyer */}
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !pendingImage) || sending}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors pb-0.5"
          >
            {sending
              ? <Sparkles size={16} className="animate-pulse" />
              : <Send size={16} />
            }
          </button>
        </div>
      </div>

      {/* Inputs fichier cachés */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
    </div>
  );
}
