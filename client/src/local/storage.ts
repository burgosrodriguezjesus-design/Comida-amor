// Dónde guarda sus datos la versión del navegador:
// - «cuenta»: almacén privado de la página en claude.ai (solo lo ve quien lo escribe).
// - «navegador»: IndexedDB de este navegador.
// - «memoria»: solo mientras la página está abierta (demostración).

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Doc = Record<string, unknown>;

export interface PhotoDoc extends Doc {
  full: string;
  thumb: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface Backend {
  kind: 'cuenta' | 'navegador' | 'memoria';
  loadMain(): Promise<Map<string, Doc>>;
  setMain(key: string, data: Doc): Promise<void>;
  deleteMain(key: string): Promise<void>;
  getPhoto(id: string): Promise<PhotoDoc | null>;
  setPhoto(id: string, data: PhotoDoc): Promise<void>;
  deletePhoto(id: string): Promise<void>;
}

// ---------- Almacén privado en claude.ai ----------

export function createDbBackend(db: any, uid: string): Backend {
  const main = db.collection(`data/users/${uid}`);
  const photos = db.doc(`data/users/${uid}/media`).collection('photos');
  const retry = async <T = any,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if ((error as { code?: string }).code !== 'unavailable') throw error;
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return fn();
    }
  };
  return {
    kind: 'cuenta',
    async loadMain() {
      const snap: any = await retry(() => main.limit(1000).get());
      const map = new Map<string, Doc>();
      for (const doc of snap.docs) if (doc.exists) map.set(doc.id, structuredClone(doc.data()));
      return map;
    },
    setMain: (key, data) => retry(() => main.doc(key).set(data)),
    deleteMain: (key) => retry(() => main.doc(key).delete()),
    async getPhoto(id) {
      const snap: any = await retry(() => photos.doc(id).get());
      return snap.exists ? (snap.data() as PhotoDoc) : null;
    },
    setPhoto: (id, data) => retry(() => photos.doc(id).set(data)),
    deletePhoto: (id) => retry(() => photos.doc(id).delete()),
  };
}

// ---------- IndexedDB ----------

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createIdbBackend(): Promise<Backend | null> {
  if (typeof indexedDB === 'undefined') return null;
  let database: IDBDatabase;
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('comida-amor', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('main');
        open.result.createObjectStore('photos');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('blocked'));
    });
  } catch {
    return null;
  }
  const store = (name: 'main' | 'photos', mode: IDBTransactionMode) => database.transaction(name, mode).objectStore(name);
  return {
    kind: 'navegador',
    async loadMain() {
      const map = new Map<string, Doc>();
      const keys = await idbRequest(store('main', 'readonly').getAllKeys());
      const values = await idbRequest(store('main', 'readonly').getAll());
      keys.forEach((k, i) => map.set(String(k), values[i]));
      return map;
    },
    setMain: async (key, data) => void (await idbRequest(store('main', 'readwrite').put(data, key))),
    deleteMain: async (key) => void (await idbRequest(store('main', 'readwrite').delete(key))),
    getPhoto: async (id) => ((await idbRequest(store('photos', 'readonly').get(id))) as PhotoDoc | undefined) ?? null,
    setPhoto: async (id, data) => void (await idbRequest(store('photos', 'readwrite').put(data, id))),
    deletePhoto: async (id) => void (await idbRequest(store('photos', 'readwrite').delete(id))),
  };
}

// ---------- Memoria ----------

export function createMemoryBackend(initialPhotos: Map<string, PhotoDoc> = new Map()): Backend {
  const main = new Map<string, Doc>();
  const photos = new Map(initialPhotos);
  return {
    kind: 'memoria',
    loadMain: async () => new Map(main),
    setMain: async (key, data) => void main.set(key, data),
    deleteMain: async (key) => void main.delete(key),
    getPhoto: async (id) => photos.get(id) ?? null,
    setPhoto: async (id, data) => void photos.set(id, data),
    deletePhoto: async (id) => void photos.delete(id),
  };
}

/**
 * Escrituras de una en una por documento (lo pide el almacén de claude.ai) y
 * agrupando ráfagas: si llegan varias seguidas, solo se escribe la última.
 */
export function serialWriter(write: (key: string, data: Doc | null) => Promise<void>) {
  const chains = new Map<string, Promise<void>>();
  const latest = new Map<string, Doc | null>();
  return (key: string, data: Doc | null): Promise<void> => {
    latest.set(key, data);
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!latest.has(key)) return;
        const value = latest.get(key)!;
        latest.delete(key);
        await write(key, value);
      });
    chains.set(key, next);
    return next;
  };
}
