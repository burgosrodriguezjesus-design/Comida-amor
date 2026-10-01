import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt con parámetros recomendados por OWASP (N=2^15, r=8, p=1).
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEM = 128 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash ficticio para igualar tiempos cuando el correo no existe. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
  return dummyHash;
}
