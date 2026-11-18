import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Podpisane, bezstanowe żetony (ciasteczko sesji, zgoda po PIN-ie): `dane.podpis`, oba w base64url.
 * Podpis HMAC-SHA256 kluczem z sekretu serwera; w dane wchodzą `iat` i `exp` (ms).
 *
 * Signed stateless tokens for the session cookie and the kiosk PIN grant.
 */

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (key: string, body: string) => createHmac('sha256', key).update(body).digest();

export function signToken(key: string, data: Record<string, unknown>, ttlMs: number, now = Date.now()): string {
	const body = b64(JSON.stringify({ ...data, iat: now, exp: now + ttlMs }));
	return `${body}.${b64(sign(key, body))}`;
}

/** Dane żetonu albo null (zły podpis, wygasły, z przyszłości, uszkodzony). */
export function verifyToken<T extends Record<string, unknown>>(key: string, token: string | undefined | null, now = Date.now()): (T & { iat: number; exp: number }) | null {
	if (!token || token.length > 4096) return null;
	const dot = token.indexOf('.');
	if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
	const body = token.slice(0, dot);
	const given = Buffer.from(token.slice(dot + 1), 'base64url');
	const expected = sign(key, body);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
		if (typeof data?.exp !== 'number' || typeof data?.iat !== 'number') return null;
		// Minuta zapasu na różnice zegara; żeton „z przyszłości” jest podejrzany.
		if (data.exp <= now || data.iat > now + 60_000) return null;
		return data;
	} catch {
		return null;
	}
}

/**
 * Klucz podpisu zależny od celu i od skrótu hasła/PIN-u: zmiana hasła unieważnia wszystkie sesje,
 * zmiana PIN-u – wydane zgody.
 */
export const derivedKey = (secret: string, purpose: string, bind = '') => createHmac('sha256', secret).update(`${purpose}\0${bind}`).digest('hex');
