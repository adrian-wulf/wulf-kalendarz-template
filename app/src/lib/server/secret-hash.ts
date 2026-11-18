import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hasła i PIN-y – nigdy jawnie: scrypt z losową solą. Zapis `scrypt:N:r:p:sól:skrót` (base64url),
 * bez znaku `$`, żeby dało się go wkleić do `.env` (Docker Compose rozwija `$`).
 * Ten sam format tworzy `node server/hash-password.js` (AUTH_PASSWORD_HASH).
 *
 * Passwords and PINs are stored as salted scrypt hashes only.
 */

export type ScryptParams = { N: number; r: number; p: number };

/** ~50–100 ms na zwykłym komputerze; testy podają mniejsze N. */
export const DEFAULT_PARAMS: ScryptParams = { N: 1 << 15, r: 8, p: 1 };
const KEYLEN = 32;
// Górne granice przy odczycie – zapis z bazy albo .env nie może zablokować serwera.
const MAX = { N: 1 << 20, r: 32, p: 16 };

const PATTERN = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/;

function derive(secret: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scrypt(secret.normalize('NFC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

export async function hashSecret(secret: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
	const salt = randomBytes(16);
	const key = await derive(secret, salt, params);
	return `scrypt:${params.N}:${params.r}:${params.p}:${salt.toString('base64url')}:${key.toString('base64url')}`;
}

/** Czy tekst wygląda na zapis z `hashSecret` (a nie na jawne hasło/PIN). */
export function isSecretHash(value: unknown): value is string {
	const m = typeof value === 'string' ? PATTERN.exec(value) : null;
	if (!m) return false;
	const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
	return N >= 2 && (N & (N - 1)) === 0 && N <= MAX.N && r >= 1 && r <= MAX.r && p >= 1 && p <= MAX.p;
}

/** Porównanie w stałym czasie; zły format zapisu = false. */
export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
	if (!stored || !isSecretHash(stored)) return false;
	const [, N, r, p, salt, hash] = PATTERN.exec(stored)!;
	const expected = Buffer.from(hash, 'base64url');
	if (expected.length !== KEYLEN) return false;
	const key = await derive(secret, Buffer.from(salt, 'base64url'), { N: Number(N), r: Number(r), p: Number(p) });
	return timingSafeEqual(key, expected);
}

export const PIN_PATTERN = /^\d{4,8}$/;
export const PASSWORD_MIN = 10;
