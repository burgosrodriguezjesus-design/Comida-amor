// Acceso a las capacidades de la página publicada en claude.ai (si existen).
// Fuera de claude.ai todo devuelve null y la app usa el almacenamiento del navegador.

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ClaudeHost {
  use(name: string): Promise<any | null>;
}

function host(): ClaudeHost | null {
  const claude = (window as unknown as { claude?: ClaudeHost }).claude;
  return claude && typeof claude.use === 'function' ? claude : null;
}

export async function useCapability<T = any>(name: string): Promise<T | null> {
  const claude = host();
  if (!claude) return null;
  try {
    return (await claude.use(name)) as T | null;
  } catch {
    return null;
  }
}

/** Identificador privado de la persona que ve la página (para su espacio de datos). */
export async function viewerId(): Promise<string | null> {
  const user = await useCapability<{ id(): Promise<string | null> }>('user');
  if (!user) return null;
  try {
    return await user.id();
  } catch {
    return null;
  }
}

export interface SaveOutcome {
  ok: boolean;
  message?: string;
}

/** Ofrece un archivo para guardar. Dentro de claude.ai usa la capacidad de descargas. */
export async function saveFileLocal(data: Blob | string, filename: string): Promise<SaveOutcome> {
  const claude = host();
  if (claude) {
    const downloads = await useCapability<{ save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> }>('downloads');
    if (!downloads) return { ok: false, message: 'Esta vista no permite descargar archivos.' };
    try {
      await downloads.save({ filename, data });
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'declined') return { ok: false };
      if (code === 'rate_limited') return { ok: false, message: 'Ya hay una descarga pendiente de confirmar.' };
      return { ok: false, message: 'No se pudo descargar el archivo en esta vista.' };
    }
  }
  const blob = typeof data === 'string' ? new Blob([data]) : data;
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
