import { useEffect, useState } from 'react';
import { localDateTimeParts } from '@shared/dates';

/** Fecha y hora local actuales, actualizadas cada 20 segundos. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return { now, ...localDateTimeParts(now) };
}

export function nowParts() {
  return localDateTimeParts(new Date());
}
