import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { setUnauthorizedHandler } from './api/client';
import { qk, useMe } from './api/hooks';
import { Layout } from './components/Layout';
import { Logo } from './components/Logo';
import { Button, EmptyState } from './components/ui';
import { EntryEditorProvider } from './context/EntryEditor';
import { FeedbackProvider } from './context/Feedback';
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

  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.setQueryData(qk.me, null);
    });
  }, [client]);

  // Mantener la zona horaria actualizada para que los recordatorios lleguen a su hora.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (me.data && tz && me.data.timezone !== tz && !me.data.isDemo) {
      void fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
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

export function App() {
  useTheme();
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <Gate />
      </FeedbackProvider>
    </BrowserRouter>
  );
}
