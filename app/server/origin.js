/**
 * Zaufane adresy (TRUSTED_ORIGINS) czytane w czasie działania, a nie przy budowaniu.
 *
 * SvelteKit odrzuca formularze, gdy nagłówek `Origin` różni się od adresu aplikacji,
 * a `csrf.trustedOrigins` wpisuje się na stałe do zbudowanego kodu. Zamiast tego serwer
 * (server/index.js) dla żądań z zaufanego `Origin` podaje adapterowi adres wprost z tego
 * nagłówka – przez własne nagłówki, które wcześniej zawsze usuwa (nie da się ich podrobić).
 *
 * Trusted origins read at runtime: for a request whose `Origin` is on the list, the app
 * treats that origin as its own, so SvelteKit's CSRF check passes. Other requests are
 * handled exactly as before.
 */

export const PROTO_HEADER = 'x-kalendarz-proto';
export const HOST_HEADER = 'x-kalendarz-host';

/**
 * `http://localhost:3000, https://kalendarz.example.ts.net/` → zbiór originów.
 * @param {string | undefined} value
 * @returns {{ origins: Set<string>, invalid: string[] }}
 */
export function parseOrigins(value) {
	const origins = new Set();
	const invalid = [];
	for (const raw of (value ?? '').split(',')) {
		const s = raw.trim();
		if (!s) continue;
		try {
			const u = new URL(s);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
			origins.add(u.origin);
		} catch {
			invalid.push(s);
		}
	}
	return { origins, invalid };
}

/**
 * TRUSTED_ORIGINS z otoczenia; puste = adres lokalny serwera (`http://localhost:PORT`, `http://127.0.0.1:PORT`).
 * Bez tego `npm start` bez Dockera odrzucał formularze (adapter-node bez nagłówka proto przyjmuje https).
 * Empty TRUSTED_ORIGINS defaults to the server's own local http origins.
 * @param {Record<string, string | undefined>} env
 * @returns {{ origins: Set<string>, invalid: string[], defaulted: boolean }}
 */
export function trustedOrigins(env) {
	if (env.TRUSTED_ORIGINS?.trim()) return { ...parseOrigins(env.TRUSTED_ORIGINS), defaulted: false };
	const port = Number(env.PORT || 3000);
	return { ...parseOrigins(`http://localhost:${port},http://127.0.0.1:${port}`), defaulted: true };
}

/**
 * Zmienia nagłówki żądania w miejscu.
 * @param {Record<string, string | string[] | undefined>} headers nagłówki Node (małe litery)
 * @param {Set<string>} trusted
 * @returns {boolean} czy origin był zaufany
 */
export function applyTrustedOrigin(headers, trusted) {
	delete headers[PROTO_HEADER];
	delete headers[HOST_HEADER];
	const origin = headers.origin;
	if (typeof origin !== 'string' || !trusted.has(origin)) return false;
	const u = new URL(origin);
	headers[PROTO_HEADER] = u.protocol.slice(0, -1);
	headers[HOST_HEADER] = u.host;
	return true;
}
