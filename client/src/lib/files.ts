import { IS_LOCAL } from './env';

export interface SaveResult {
  ok: boolean;
  message?: string;
}

/** Guarda un archivo en el dispositivo (descarga normal o, en la versión de prueba, la descarga de claude.ai). */
export async function saveFile(data: Blob | string, filename: string): Promise<SaveResult> {
  if (IS_LOCAL) {
    const { saveFileLocal } = await import('@/local/platform');
    return saveFileLocal(data, filename);
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { ok: true };
}
