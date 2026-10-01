import { api } from '@/api/client';
import type { ReminderSettings } from '@shared/types';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Pide permiso y registra este dispositivo para recibir recordatorios. */
export async function subscribeToPush(publicKey: string): Promise<ReminderSettings> {
  if (!pushSupported()) throw new Error('Este navegador no admite notificaciones.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('No has dado permiso para las notificaciones. Puedes activarlo en los ajustes del navegador.');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  return api.post<ReminderSettings>('/api/push/subscribe', sub.toJSON());
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
