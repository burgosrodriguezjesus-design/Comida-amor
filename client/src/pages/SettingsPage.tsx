import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Download, KeyRound, LogOut, MonitorSmartphone, Palette, Plus, ShieldCheck, Trash2, User as UserIcon, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { LIMITS } from '@shared/constants';
import type { ReminderSettings, ReminderTime, User } from '@shared/types';
import { api, errorMessage } from '@/api/client';
import { qk, useMe, useReminders, useSaveReminders } from '@/api/hooks';
import { Sheet } from '@/components/Sheet';
import { Button, PageHeader, Segmented, Spinner, Switch } from '@/components/ui';
import { useFeedback } from '@/context/Feedback';
import { newKey } from '@/lib/draft';
import { currentPushSubscription, isIos, isStandalone, pushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { IS_LOCAL } from '@/lib/env';
import { saveFile } from '@/lib/files';
import { useTheme, type ThemePreference } from '@/lib/theme';

function Section({ id, icon, title, children }: { id?: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-lg font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const me = useMe();
  const user = me.data!;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ajustes" subtitle="Tu cuenta, los recordatorios y tus datos." />
      <div className="space-y-5">
        <ProfileSection user={user} />
        <AppearanceSection />
        <RemindersSection />
        <PrivacySection user={user} />
        <AccountSection user={user} />
        <p className="px-2 pb-4 text-center text-[13px] leading-relaxed text-ink-3">
          Comida Amor es un diario personal. No diagnostica enfermedades ni sustituye el consejo de un profesional sanitario.
        </p>
      </div>
    </div>
  );
}

function ProfileSection({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  const { toast } = useFeedback();
  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch<{ user: User }>('/api/account', { name });
      client.setQueryData(qk.me, res.user);
      toast({ message: 'Nombre actualizado', tone: 'success' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Section icon={<UserIcon size={18} />} title="Perfil">
      <label className="label" htmlFor="profile-name">
        Nombre
      </label>
      <div className="flex gap-2">
        <input id="profile-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button variant="secondary" className="h-auto" onClick={save} loading={saving} disabled={!name.trim() || name.trim() === user.name}>
          Guardar
        </Button>
      </div>
      {!user.isDemo && user.email && <p className="mt-2 text-sm text-ink-3">Correo: {user.email}</p>}
    </Section>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  return (
    <Section icon={<Palette size={18} />} title="Apariencia">
      <Segmented<ThemePreference>
        label="Tema"
        className="w-full"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: 'Automático' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Oscuro' },
        ]}
      />
      <p className="mt-2 text-sm text-ink-3">«Automático» sigue la configuración de tu dispositivo.</p>
    </Section>
  );
}

function RemindersSection() {
  const reminders = useReminders();
  const save = useSaveReminders();
  const client = useQueryClient();
  const { toast } = useFeedback();
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentPushSubscription()
      .then((sub) => setDeviceOn(Boolean(sub)))
      .catch(() => setDeviceOn(false));
  }, []);

  if (reminders.isPending) return <Section icon={<Bell size={18} />} title="Recordatorios"><Spinner /></Section>;
  if (!reminders.data) return null;
  const settings = reminders.data;

  const persist = (patch: Partial<Pick<ReminderSettings, 'enabled' | 'quietMinutes' | 'times'>>) => {
    const next = { enabled: settings.enabled, quietMinutes: settings.quietMinutes, times: settings.times, ...patch };
    client.setQueryData<ReminderSettings>(qk.reminders, { ...settings, ...next });
    save.mutate(next, { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) });
  };

  const enableDevice = async () => {
    if (!settings.publicKey) return;
    setBusy(true);
    try {
      const updated = await subscribeToPush(settings.publicKey);
      client.setQueryData(qk.reminders, updated);
      setDeviceOn(true);
      return true;
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error', duration: 6000 });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    persist({ enabled });
    if (enabled && !IS_LOCAL && pushSupported() && deviceOn === false && settings.publicKey) await enableDevice();
  };

  const updateTime = (id: string, patch: Partial<ReminderTime>) =>
    persist({ times: settings.times.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const test = async () => {
    try {
      await api.post('/api/push/test');
      toast({ message: 'Notificación de prueba enviada', tone: 'success' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    }
  };

  const supported = pushSupported();
  const needsInstall = isIos() && !isStandalone();

  return (
    <Section id="recordatorios" icon={<Bell size={18} />} title="Recordatorios">
      <Switch
        checked={settings.enabled}
        onChange={(v) => void toggleEnabled(v)}
        label="Recordarme que registre lo que como"
        description="Un aviso suave: «¿Has registrado lo que acabas de comer?»"
      />

      {settings.enabled && (
        <div className="animate-pop-in mt-5 space-y-5">
          <div>
            <h3 className="label">Horas de aviso</h3>
            <ul className="space-y-2">
              {settings.times.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 py-1.5 pr-1.5 pl-3">
                  <input
                    type="time"
                    value={t.time}
                    onChange={(e) => e.target.value && updateTime(t.id, { time: e.target.value })}
                    className="min-h-10 rounded-xl bg-transparent px-1 text-[17px] font-semibold tabular-nums focus:outline-none"
                    aria-label="Hora del recordatorio"
                  />
                  <span className="flex-1" />
                  <Switch hideLabel checked={t.enabled} onChange={(enabled) => updateTime(t.id, { enabled })} label={`Activar aviso de las ${t.time}`} />
                  <button
                    type="button"
                    onClick={() => persist({ times: settings.times.filter((x) => x.id !== t.id) })}
                    aria-label={`Quitar aviso de las ${t.time}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface hover:text-danger"
                  >
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
            {settings.times.length < LIMITS.remindersPerUser && (
              <button
                type="button"
                onClick={() => persist({ times: [...settings.times, { id: newKey(), time: '12:00', enabled: true }] })}
                className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
              >
                <Plus size={17} /> Añadir hora
              </button>
            )}
          </div>

          <label className="block">
            <span className="label">Para que no sea molesto, no avisar si he registrado algo en…</span>
            <select
              className="field"
              value={settings.quietMinutes}
              onChange={(e) => persist({ quietMinutes: Number(e.target.value) })}
            >
              <option value={30}>los últimos 30 minutos</option>
              <option value={60}>la última hora</option>
              <option value={90}>la última hora y media</option>
              <option value={120}>las últimas 2 horas</option>
              <option value={0}>(avisar siempre)</option>
            </select>
            <span className="mt-1.5 block text-[13px] text-ink-3">Como mucho, un aviso por cada hora elegida y día.</span>
          </label>

          <div className="rounded-2xl border border-line p-4">
            <p className="flex items-center gap-2 font-semibold">
              <MonitorSmartphone size={18} className="text-ink-3" aria-hidden="true" /> Este dispositivo
            </p>
            {IS_LOCAL ? (
              <p className="mt-1 text-sm text-ink-2">
                En esta versión de prueba el aviso aparece dentro de la app mientras la tienes abierta. En la app completa,
                instalada en el móvil, llega como notificación aunque esté cerrada.
              </p>
            ) : !supported ? (
              <p className="mt-1 text-sm text-ink-2">
                Este navegador no admite notificaciones. Mientras tengas la app abierta, verás el aviso dentro de ella.
              </p>
            ) : !settings.pushConfigured ? (
              <p className="mt-1 text-sm text-ink-2">El servidor no tiene configuradas las notificaciones.</p>
            ) : deviceOn ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ok">Recibirás los recordatorios aquí.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={<BellRing size={15} />} onClick={test}>
                    Probar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await unsubscribeFromPush();
                      setDeviceOn(false);
                      void reminders.refetch();
                    }}
                  >
                    Desactivar aquí
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <p className="text-sm text-ink-2">
                  {needsInstall
                    ? 'En iPhone y iPad, primero añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrela desde ahí.'
                    : 'Activa las notificaciones para recibir los avisos aunque la app esté cerrada.'}
                </p>
                <Button size="sm" onClick={() => void enableDevice()} loading={busy} disabled={needsInstall}>
                  Activar notificaciones aquí
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

type DangerAction = 'entries' | 'account' | 'password' | null;

const STORAGE_TEXT: Record<string, string> = {
  cuenta: 'Tus registros, síntomas y fotos se guardan de forma privada en tu cuenta de Claude: solo tú puedes verlos, aunque compartas esta página.',
  navegador: 'Tus registros se guardan solo en este navegador y dispositivo. Si borras los datos del navegador, se perderán: descarga una copia de vez en cuando.',
  memoria: 'En esta vista no se pueden guardar datos: lo que registres se perderá al cerrar la página.',
  demo: 'Estás viendo datos de ejemplo: no se guardan en ningún sitio.',
};

function PrivacySection({ user }: { user: User }) {
  const [action, setAction] = useState<DangerAction>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const client = useQueryClient();
  const { toast } = useFeedback();
  useEffect(() => {
    if (!IS_LOCAL) return;
    void import('@/local/localApi').then((m) => m.storageKind()).then(setStorage);
  }, []);
  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.get<unknown>('/api/account/export');
      const result = await saveFile(JSON.stringify(data, null, 2), `comida-amor-datos-${new Date().toISOString().slice(0, 10)}.json`);
      if (result.message) toast({ message: result.message, tone: 'error' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };
  const signOutLocally = () => {
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
    client.setQueryData(qk.me, null);
  };
  return (
    <Section id="privacidad" icon={<ShieldCheck size={18} />} title="Privacidad y datos">
      <p className="text-[15px] leading-relaxed text-ink-2">
        {IS_LOCAL
          ? (storage && STORAGE_TEXT[storage]) ?? 'Tus registros son privados: solo tú puedes verlos.'
          : 'Tus registros, síntomas y fotos son privados: solo se pueden ver con tu sesión iniciada y nunca se publican ni se comparten. Las contraseñas se guardan cifradas de forma irreversible.'}
      </p>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => void exportData()}
          disabled={exporting}
          className="flex h-12 items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 text-left font-semibold hover:bg-surface-2 disabled:opacity-60"
        >
          <Download size={18} className="text-ink-3" aria-hidden="true" /> Descargar una copia de mis datos
        </button>
        {!user.isDemo && !IS_LOCAL && (
          <button
            type="button"
            onClick={() => setAction('password')}
            className="flex h-12 items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 text-left font-semibold hover:bg-surface-2"
          >
            <KeyRound size={18} className="text-ink-3" aria-hidden="true" /> Cambiar contraseña
          </button>
        )}
        {!IS_LOCAL && (
        <button
          type="button"
          onClick={async () => {
            await unsubscribeFromPush();
            await api.post('/api/account/logout-all').catch(() => undefined);
            toast({ message: 'Se ha cerrado la sesión en todos tus dispositivos' });
            signOutLocally();
          }}
          className="flex h-12 items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 text-left font-semibold hover:bg-surface-2"
        >
          <LogOut size={18} className="text-ink-3" aria-hidden="true" /> Cerrar sesión en todos los dispositivos
        </button>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-danger-soft/60 p-4">
        <h3 className="font-semibold text-danger">Zona de borrado</h3>
        <p className="mt-1 text-sm text-ink-2">Estas acciones son definitivas y no se pueden deshacer.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" icon={<Trash2 size={17} />} onClick={() => setAction('entries')}>
            Borrar todos mis registros
          </Button>
          <Button variant="danger" icon={<Trash2 size={17} />} onClick={() => setAction('account')}>
            {IS_LOCAL ? 'Borrar todo y empezar de cero' : 'Eliminar mi cuenta'}
          </Button>
        </div>
      </div>

      {action === 'password' && <PasswordSheet onClose={() => setAction(null)} />}
      {(action === 'entries' || action === 'account') && (
        <DangerSheet
          kind={action}
          isDemo={user.isDemo || IS_LOCAL}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            if (action === 'account') {
              void unsubscribeFromPush();
              signOutLocally();
            } else {
              client.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
              toast({ message: 'Se han borrado todos tus registros', tone: 'success' });
            }
          }}
        />
      )}
    </Section>
  );
}

function DangerSheet({ kind, isDemo, onClose, onDone }: { kind: 'entries' | 'account'; isDemo: boolean; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const word = 'BORRAR';
  const ready = confirmText.trim().toUpperCase() === word && (isDemo || password.length > 0);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(kind === 'account' ? '/api/account/delete' : '/api/account/delete-entries', { password });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={kind === 'account' ? (IS_LOCAL ? 'Borrar todo' : 'Eliminar mi cuenta') : 'Borrar todos mis registros'}
      footer={
        <Button variant="danger" size="lg" className="w-full" disabled={!ready} loading={busy} onClick={submit}>
          {kind === 'account' ? (IS_LOCAL ? 'Borrar todo' : 'Eliminar cuenta y datos') : 'Borrar todos los registros'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-[15px] leading-relaxed text-ink-2">
          {kind === 'account'
            ? IS_LOCAL
              ? 'Se eliminarán definitivamente tu nombre, todos tus registros, síntomas, fotos y recordatorios. No se podrá recuperar nada.'
              : 'Se eliminarán definitivamente tu cuenta, todos tus registros, síntomas, fotos y recordatorios. No se podrá recuperar nada.'
            : 'Se eliminarán definitivamente todos tus registros, síntomas y fotos. Tu cuenta seguirá activa.'}{' '}
          Si quieres conservar una copia, descarga antes tus datos o un informe en PDF.
        </p>
        {!isDemo && (
          <label className="block">
            <span className="label">Tu contraseña</span>
            <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        <label className="block">
          <span className="label">Escribe {word} para confirmar</span>
          <input className="field" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        </label>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/account/password', { currentPassword: current, newPassword: next });
      toast({ message: 'Contraseña cambiada. Se han cerrado tus otras sesiones.', tone: 'success' });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title="Cambiar contraseña"
      footer={
        <Button size="lg" className="w-full" onClick={submit} loading={busy} disabled={!current || next.length < 8}>
          Cambiar contraseña
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <label className="block">
          <span className="label">Contraseña actual</span>
          <input type="password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className="label">Nueva contraseña</span>
          <input type="password" className="field" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} />
          <span className="mt-1.5 block text-[13px] text-ink-3">Mínimo 8 caracteres.</span>
        </label>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function AccountSection({ user }: { user: User }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (IS_LOCAL && !user.isDemo) return null;
  const logout = async () => {
    setBusy(true);
    if (user.isDemo) {
      try {
        sessionStorage.setItem('ca-auth-mode', 'register');
      } catch {
        /* sin almacenamiento */
      }
    }
    await unsubscribeFromPush();
    await api.post('/api/auth/logout').catch(() => undefined);
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.me[0] });
    client.setQueryData(qk.me, null);
  };
  return (
    <Section id="cuenta" icon={<LogOut size={18} />} title="Sesión">
      {user.isDemo ? (
        <>
          <p className="mb-3 text-[15px] text-ink-2">
            {IS_LOCAL
              ? 'Estás viendo datos de ejemplo. Cuando quieras, sal de la demostración y empieza tu propio diario.'
              : 'Estás en la cuenta de demostración: los datos son de ejemplo y se regeneran cada día. Crea tu propia cuenta para llevar tu diario de forma privada.'}
          </p>
          <Button className="w-full" onClick={logout} loading={busy}>
            {IS_LOCAL ? 'Salir y empezar mi diario' : 'Salir de la demo y crear mi cuenta'}
          </Button>
        </>
      ) : (
        <Button variant="secondary" className="w-full" icon={<LogOut size={18} />} onClick={logout} loading={busy}>
          Cerrar sesión
        </Button>
      )}
    </Section>
  );
}
