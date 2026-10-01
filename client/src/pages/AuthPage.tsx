import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { User } from '@shared/types';
import { api, errorMessage } from '@/api/client';
import { qk, useAuthOptions } from '@/api/hooks';
import { Logo } from '@/components/Logo';
import { Button, Segmented } from '@/components/ui';

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>(() => {
    try {
      const saved = sessionStorage.getItem('ca-auth-mode');
      sessionStorage.removeItem('ca-auth-mode');
      return saved === 'register' ? 'register' : 'login';
    } catch {
      return 'login';
    }
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);
  const client = useQueryClient();
  const options = useAuthOptions();

  const finish = (user: User) => {
    // Se descartan datos de otra sesión anterior y se entra directamente.
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] && q.queryKey[0] !== qk.authOptions[0] });
    client.setQueryData(qk.me, user);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy('form');
    try {
      const { user } =
        mode === 'login'
          ? await api.post<{ user: User }>('/api/auth/login', { email, password })
          : await api.post<{ user: User }>('/api/auth/register', { name, email, password, timezone: timezone() });
      finish(user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const demo = async () => {
    setError(null);
    setBusy('demo');
    try {
      const { user } = await api.post<{ user: User }>('/api/auth/demo', { timezone: timezone() });
      finish(user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight">Comida Amor</h1>
          <p className="mt-2 text-[17px] text-ink-2">Tu diario de alimentación, sencillo y privado.</p>
        </div>

        <div className="card p-6">
          {options.data?.registrationEnabled !== false && (
            <Segmented
              label="Acceso"
              className="mb-6 w-full"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setError(null);
              }}
              options={[
                { value: 'login', label: 'Entrar' },
                { value: 'register', label: 'Crear cuenta' },
              ]}
            />
          )}
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">
                  Tu nombre
                </label>
                <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required maxLength={60} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="field pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-2 text-ink-3 hover:text-ink"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {mode === 'register' && <p className="mt-1.5 text-[13px] text-ink-3">Mínimo 8 caracteres.</p>}
            </div>
            {error && (
              <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy === 'form'} disabled={busy !== null}>
              {mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
            </Button>
          </form>
        </div>

        {options.data?.demoEnabled && (
          <div className="mt-5 text-center">
            <Button variant="ghost" icon={<Sparkles size={18} />} onClick={demo} loading={busy === 'demo'} disabled={busy !== null}>
              Probar con datos de demostración
            </Button>
          </div>
        )}

        <p className="mt-8 flex items-start justify-center gap-2 text-center text-[13px] leading-relaxed text-ink-3">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Tus registros son privados: solo tú puedes verlos. Esta aplicación no hace diagnósticos ni sustituye el consejo médico.
        </p>
      </div>
    </div>
  );
}
