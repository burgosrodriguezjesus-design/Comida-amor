import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
import { api, setUnauthorizedHandler } from './api/client';
import { qk, useMe } from './api/hooks';
import { Layout } from './components/Layout';
import { Logo } from './components/Logo';
import { Button, EmptyState } from './components/ui';
import { EntryEditorProvider } from './context/EntryEditor';
import { FeedbackProvider } from './context/Feedback';
import { IS_LOCAL } from './lib/env';
import { useTheme } from './lib/theme';
import { AuthPage } from './pages/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { HistoryPage } from './pages/HistoryPage';
import { ReportPage } from './pages/ReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';

function Gate() {
  const me = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();
  const previous = useRef<unknown>(undefined);

  // Al iniciar sesión (o empezar el diario) se abre «Hoy»; al abrir la app con la sesión ya
  // iniciada se respeta la dirección (p. ej. un acceso directo al informe).
  useEffect(() => {
    if (me.isPending) return;
    const now = me.data ?? null;
    if (now && (previous.current === null || (IS_LOCAL && previous.current === undefined))) navigate('/', { replace: true });
    previous.current = now;
  }, [me.data, me.isPending, navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.setQueryData(qk.me, null);
    });
  }, [client]);

  // Mantener la zona horaria actualizada para que los recordatorios lleguen a su hora.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (me.data && tz && me.data.timezone !== tz && !me.data.isDemo) {
      void api.patch('/api/account', { timezone: tz }).catch(() => undefined);
    }
  }, [me.data]);

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse">
          <Logo size={56} />
        </div>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState title="No se puede conectar" action={<Button onClick={() => me.refetch()}>Reintentar</Button>}>
          Comprueba tu conexión a internet e inténtalo de nuevo.
        </EmptyState>
      </div>
    );
  }
  if (!me.data) return <AuthPage />;

  return (
    <EntryEditorProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TodayPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="historial" element={<HistoryPage />} />
          <Route path="informe" element={<ReportPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EntryEditorProvider>
  );
}

// En la versión de prueba (página publicada) la dirección no cambia: se navega en memoria.
const Router = IS_LOCAL ? MemoryRouter : BrowserRouter;

export function App() {
  useTheme();
  return (
    <Router>
      <FeedbackProvider>
        <Gate />
      </FeedbackProvider>
    </Router>
  );
}
