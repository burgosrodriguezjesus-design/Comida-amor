// Cliente HTTP mínimo para la API. Las cookies de sesión viajan automáticamente.

import { IS_LOCAL } from '@/lib/env';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (IS_LOCAL) {
    // Versión de prueba: la «API» vive en el propio navegador.
    const { localRequest } = await import('@/local/localApi');
    try {
      return await localRequest<T>(method, url, body);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
      throw error;
    }
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0, 'offline');
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
    const payload = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(payload.error ?? 'Ha ocurrido un error. Inténtalo de nuevo.', res.status, payload.code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, value === true ? '1' : String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Ha ocurrido un error inesperado.';
}
