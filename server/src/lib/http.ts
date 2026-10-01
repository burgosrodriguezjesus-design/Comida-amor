import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'El recurso') => new HttpError(404, `${what} no existe o no tienes acceso.`, 'not_found');

/** Valida con zod y lanza un 400 con un mensaje en español si algo no cuadra. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message && !/^(Invalid|Too|Expected|Unrecognized)/.test(issue.message)
      ? issue.message
      : 'Algunos datos no son válidos. Revísalos e inténtalo de nuevo.';
    throw new HttpError(400, message, 'validation');
  }
  return result.data;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    const message = (err as { type?: string }).type === 'entity.too.large'
      ? 'El contenido es demasiado grande.'
      : 'La petición no es válida.';
    res.status(status).json({ error: message });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.' });
}
