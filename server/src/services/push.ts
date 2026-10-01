import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import type { AppConfig } from '../config';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = 'ok' | 'gone' | 'error';

export interface PushService {
  configured: boolean;
  publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/**
 * Notificaciones push estándar (Web Push con claves VAPID). Las claves se leen
 * de las variables de entorno o se generan una vez y se guardan en DATA_DIR.
 */
export function createPushService(config: AppConfig): PushService {
  let keys: { publicKey: string; privateKey: string } | null = null;
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    } else {
      const file = path.join(config.dataDir, 'vapid.json');
      if (fs.existsSync(file)) {
        keys = JSON.parse(fs.readFileSync(file, 'utf8'));
      } else {
        keys = webpush.generateVAPIDKeys();
        fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
      }
    }
    webpush.setVapidDetails(config.vapidSubject, keys!.publicKey, keys!.privateKey);
  } catch (error) {
    console.warn('[push] No se pudieron configurar las notificaciones push:', (error as Error).message);
    keys = null;
  }

  return {
    configured: keys !== null,
    publicKey: keys?.publicKey ?? null,
    async send(target, payload) {
      if (!keys) return 'error';
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 30, urgency: 'normal', topic: payload.tag.slice(0, 32) },
        );
        return 'ok';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        console.warn('[push] Error al enviar:', status ?? (error as Error).message);
        return 'error';
      }
    },
  };
}

/** Implementación vacía para pruebas. */
export function createNoopPushService(): PushService & { sent: { target: PushTarget; payload: PushPayload }[] } {
  const sent: { target: PushTarget; payload: PushPayload }[] = [];
  return {
    configured: true,
    publicKey: 'test-public-key',
    sent,
    async send(target, payload) {
      sent.push({ target, payload });
      return 'ok';
    },
  };
}
