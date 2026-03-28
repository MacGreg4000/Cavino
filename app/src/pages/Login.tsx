import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wine, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30">
          <Wine size={32} className="text-accent-bright" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-text">Caveau</h1>
        <p className="text-text-muted text-sm">Accès privé</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoFocus
            className="w-full bg-surface border border-border rounded-[var(--radius-md)] px-4 py-3 text-text placeholder:text-text-muted outline-none focus:border-accent/60 transition-colors pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && (
          <p className="text-danger text-sm text-center">{error}</p>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Entrer
        </Button>
      </form>
    </div>
  );
}
