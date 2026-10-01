import clsx from 'clsx';
import { CalendarDays, ChartColumn, FileText, House, Plus, Settings, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMe } from '@/api/hooks';
import { useEntryEditor } from '@/context/EntryEditor';
import { useInAppReminders } from '@/lib/useInAppReminders';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Hoy', icon: House, end: true },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/historial', label: 'Historial', icon: ChartColumn },
  { to: '/informe', label: 'Informe', icon: FileText },
];

function BottomNav() {
  const { openQuick } = useEntryEditor();
  const item = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        clsx(
          'flex min-w-0 flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11.5px] font-semibold transition-colors',
          isActive ? 'text-brand' : 'text-ink-3 hover:text-ink-2',
        )
      }
    >
      {({ isActive }) => (
        <>
          <n.icon size={23} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
          {n.label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav
      aria-label="Navegación principal"
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-xl items-stretch px-2">
        {NAV.slice(0, 2).map(item)}
        <div className="flex w-20 shrink-0 justify-center">
          <button
            type="button"
            onClick={openQuick}
            aria-label="Registro rápido: añadir lo que has comido"
            className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-ink shadow-soft-lg ring-[6px] ring-bg transition-transform active:scale-95"
          >
            <Plus size={32} strokeWidth={2.6} />
          </button>
        </div>
        {NAV.slice(2).map(item)}
      </div>
    </nav>
  );
}

function SideNav() {
  const { openQuick } = useEntryEditor();
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <Logo size={40} />
        <div>
          <p className="font-display text-lg leading-tight font-semibold">Comida Amor</p>
          <p className="text-xs text-ink-3">Diario de alimentación</p>
        </div>
      </div>
      <button
        type="button"
        onClick={openQuick}
        className="mb-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-brand-ink shadow-soft transition-transform active:scale-[0.98]"
      >
        <Zap size={18} /> Registro rápido
      </button>
      <nav aria-label="Navegación principal" className="space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition-colors',
                isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            <n.icon size={20} aria-hidden="true" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <NavLink
          to="/ajustes"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition-colors',
              isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <Settings size={20} aria-hidden="true" /> Ajustes
        </NavLink>
        <p className="mt-4 px-3 text-xs text-ink-3">Pulsa <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-sans">N</kbd> para un registro rápido.</p>
      </div>
    </aside>
  );
}

function DemoBanner() {
  const me = useMe();
  const navigate = useNavigate();
  if (!me.data?.isDemo) return null;
  return (
    <div className="no-print bg-ink px-4 py-2 text-center text-[13px] text-bg">
      Estás viendo datos de demostración.{' '}
      <button type="button" className="font-bold underline underline-offset-2" onClick={() => navigate('/ajustes#cuenta')}>
        Crear mi propia cuenta
      </button>
    </div>
  );
}

export function Layout() {
  const { openQuick, openNew, isOpen } = useEntryEditor();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  useInAppReminders();

  // Accesos directos: notificaciones y atajos de la app instalada (?nuevo=rapido|completo).
  useEffect(() => {
    const nuevo = params.get('nuevo');
    if (!nuevo) return;
    if (nuevo === 'completo') openNew();
    else openQuick();
    params.delete('nuevo');
    setParams(params, { replace: true });
  }, [params, setParams, openQuick, openNew]);

  // Atajo de teclado "N" en ordenador.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        openQuick();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, openQuick]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:flex">
      <SideNav />
      <div className="min-w-0 flex-1">
        <DemoBanner />
        <main className="pb-nav safe-top px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export function SettingsLink() {
  return (
    <NavLink
      to="/ajustes"
      aria-label="Ajustes"
      title="Ajustes"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-2 shadow-soft-sm transition-colors hover:text-ink lg:hidden"
    >
      <Settings size={21} />
    </NavLink>
  );
}
