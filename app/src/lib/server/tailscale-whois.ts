import http from 'node:http';
import { clientAddress, forwardedLogin, parseIpList, type AuthConfig, type RequestInfo } from './auth.js';

/**
 * Sprawdzenie loginu z `tailscale serve` przez LocalAPI tailscaled (`/localapi/v0/whois`).
 *
 * `Tailscale-User-Login` przyjmujemy od adresów z TRUSTED_PROXIES – czyli także od dowolnego procesu na tym
 * komputerze (albo kontenera w sieci Dockera), który sam dopisze ten nagłówek. Z `TAILSCALE_WHOIS` login
 * musi należeć do właściciela urządzenia tailnetu, z którego przyszło żądanie (adres z X-Forwarded-For,
 * który dokleja `tailscale serve`). Wymyślony login nie przejdzie. Proces, który poda X-Forwarded-For
 * prawdziwego urządzenia i login jego właściciela, nadal przejdzie – patrz README (model zagrożeń).
 *
 * Verifies the Tailscale login header against tailscaled's LocalAPI whois for the client tailnet address.
 */

export const TAILSCALE_SOCKET = '/var/run/tailscale/tailscaled.sock';

/** Adresy tailnetu: CGNAT 100.64.0.0/10 i ULA Tailscale. */
const TAILNET = parseIpList('100.64.0.0/10,fd7a:115c:a1e0::/48').list;

export type WhoisLookup = (addr: string) => Promise<string | null>;

/** Login właściciela adresu tailnetu albo null (nieznany adres, urządzenie z tagiem). Błąd połączenia – wyjątek. */
export function whois(socketPath: string, addr: string, timeoutMs = 2000): Promise<string | null> {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{ socketPath, path: `/localapi/v0/whois?addr=${encodeURIComponent(addr)}`, headers: { host: 'local-tailscaled.sock' }, timeout: timeoutMs },
			(res) => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', (c: string) => {
					body += c;
					if (body.length > 256 * 1024) req.destroy(new Error('whois: odpowiedź za duża'));
				});
				res.on('end', () => {
					if (res.statusCode === 404) return resolve(null);
					if (res.statusCode !== 200) return reject(new Error(`whois: HTTP ${res.statusCode}`));
					try {
						const d = JSON.parse(body) as { Node?: { Tags?: string[] }; UserProfile?: { LoginName?: string } };
						// Urządzenia z tagami nie mają użytkownika (LoginName „tagged-devices”).
						const login = d.Node?.Tags?.length ? null : d.UserProfile?.LoginName?.trim().toLowerCase();
						resolve(login || null);
					} catch (e) {
						reject(e);
					}
				});
			}
		);
		req.on('timeout', () => req.destroy(new Error('whois: brak odpowiedzi')));
		req.on('error', reject);
	});
}

/** whois z pamięcią na 60 s (każde żądanie z telefonu pytałoby tailscaled). */
export function cachedWhois(socketPath: string, ttlMs = 60_000): WhoisLookup {
	const cache = new Map<string, { login: string | null; at: number }>();
	return async (addr) => {
		const hit = cache.get(addr);
		if (hit && Date.now() - hit.at < ttlMs) return hit.login;
		const login = await whois(socketPath, addr);
		if (cache.size > 500) cache.clear();
		cache.set(addr, { login, at: Date.now() });
		return login;
	};
}

let warned = false;

/**
 * Login z nagłówka Tailscale po sprawdzeniu w whois: `undefined` – sprawdzanie wyłączone (decyduje sam
 * nagłówek), `null` – odrzucony, inaczej login. Błąd LocalAPI = odrzucenie (bez panelu, dopóki tailscaled nie odpowie).
 */
export async function verifiedTailscaleLogin(req: RequestInfo, cfg: AuthConfig, lookup: WhoisLookup | null): Promise<string | null | undefined> {
	if (cfg.mode !== 'tailscale' || !cfg.tailscaleWhois) return undefined;
	const header = forwardedLogin(req, cfg);
	if (!header) return undefined;
	if (!lookup) return null;
	const client = clientAddress(req, cfg);
	if (!TAILNET.has(client)) return null;
	try {
		const login = await lookup(client);
		return login === header ? header : null;
	} catch (e) {
		if (!warned) console.warn(`[auth] Tailscale whois nie działa (${e instanceof Error ? e.message : e}) – loginy z tailnetu odrzucone`);
		warned = true;
		return null;
	}
}
