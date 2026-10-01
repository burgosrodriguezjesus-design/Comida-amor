import { useEffect, useState } from 'react';
import { timeToMinutes } from '@shared/dates';
import { useDayEntries, useReminders } from '@/api/hooks';
import { useEntryEditor } from '@/context/EntryEditor';
import { useFeedback } from '@/context/Feedback';
import { currentPushSubscription } from './push';
import { useNow } from './useNow';

/**
 * Plan B de los recordatorios: si este dispositivo no recibe notificaciones push
 * pero la app está abierta, se muestra un aviso discreto dentro de la propia app.
 */
export function useInAppReminders() {
  const reminders = useReminders();
  const { date, time } = useNow();
  const today = useDayEntries(date);
  const { openQuick } = useEntryEditor();
  const { toast } = useFeedback();
  const [hasPush, setHasPush] = useState<boolean | null>(null);

  useEffect(() => {
    currentPushSubscription()
      .then((sub) => setHasPush(Boolean(sub)))
      .catch(() => setHasPush(false));
  }, [reminders.data?.subscriptions]);

  useEffect(() => {
    const settings = reminders.data;
    if (!settings?.enabled || hasPush !== false || !today.data) return;
    const nowMinutes = timeToMinutes(time);
    for (const reminder of settings.times) {
      if (!reminder.enabled) continue;
      const elapsed = nowMinutes - timeToMinutes(reminder.time);
      if (elapsed < 0 || elapsed > 10) continue;
      const key = `ca-reminder-${date}-${reminder.id}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch {
        continue;
      }
      const last = today.data[today.data.length - 1];
      if (last && nowMinutes - timeToMinutes(last.eatenAt.slice(11, 16)) <= settings.quietMinutes) continue;
      toast({
        message: '¿Has registrado lo que acabas de comer?',
        tone: 'info',
        action: { label: 'Registrar', onClick: openQuick },
        duration: 20_000,
      });
    }
  }, [time, date, reminders.data, hasPush, today.data, toast, openQuick]);
}
