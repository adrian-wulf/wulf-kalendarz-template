import { BlockList, isIP } from 'node:net';
import { existsSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isSecretHash } from './secret-hash.js';

/**
 * Kto wysyła żądanie – trzy tryby (`AUTH_MODE`), opis i model zagrożeń w README (Bezpieczeństwo):
 *
 * - `tailscale` (domyślny): `tailscale serve` dokleja login użytkownika tailnetu (`Tailscale-User-Login`).
 *   Nagłówek liczy się tylko z adresów z TRUSTED_PROXIES (domyślnie localhost, w obrazie Dockera także sieć Dockera).
 * - `proxy`: reverse proxy z logowaniem (Authelia, Authentik, Caddy forward_auth…) podaje login w nagłówku
 *   (`AUTH_PROXY_HEADER`, domyślnie `Remote-User`) – tylko z adresów TRUSTED_PROXIES; z innych jest ignorowany.
 * - `password`: jedno hasło domowe, sesja w podpisanym ciasteczku.
 *
 * We wszystkich trybach kiosk (Chromium na tym samym komputerze, `http://localhost:PORT`) działa bez
 * logowania, a `/api/*` przyjmuje też `Authorization: Bearer <API_TOKEN>` (skrypty, Home Assistant).
 *
 * Who is calling: kiosk on localhost, a user authenticated by Tailscale / a trusted proxy header /
 * a password session, or a script with the API token.
 */

export type AuthMode = 'tailscale' | 'proxy' | 'password';
export const AUTH_MODES: AuthMode[] = ['tailscale', 'proxy', 'password'];

/** Lista adresów IP i podsieci CIDR (IPv4/IPv6). */
export interface IpList {
	has(ip: string): boolean;
	readonly entries: string[];
}

export interface AuthConfig {
	mode: AuthMode;
	adminLogins: string[];
	/** Tylko development: /admin bez logowania. */
	adminDev: boolean;
	/** Nagłówek z loginem od reverse proxy (małe litery). */
	proxyHeader: string;
	trustedProxies: IpList;
	/** Kiosk = żądanie z tych adresów, na `localhost`, bez nagłówków proxy. */
	kioskIps: IpList;
	kioskLocal: boolean;
	apiToken: string | null;
	/** AUTH_PASSWORD_HASH – hasło z .env (wtedy panel go nie zmienia). */
	passwordHash: string | null;
	sessionSecret: string | null;
	cookieSecure: 'auto' | 'always' | 'never';
	sessionDays: number;
	/** Gniazdo LocalAPI tailscaled do sprawdzania loginu (whois); null = wierzymy samemu nagłówkowi. */
	tailscaleWhois: string | null;
	warnings: string[];
}

/**
 * Domyślne TRUSTED_PROXIES i KIOSK_IPS poza Dockerem: tylko localhost. Obraz Dockera ustawia `LOCAL_NETS`
 * (localhost i sieci Dockera 172.16.0.0/12 – stamtąd widać `tailscale serve` i kiosk przy porcie z Dockera).
 * Poza Dockerem sieć 172.16.0.0/12 może być zwykłym LAN-em – ufanie jej pozwalałoby podrobić nagłówki.
 */
export const DEFAULT_LOCAL = '127.0.0.0/8,::1';

const unmap = (ip: string) => (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip);

export function parseIpList(spec: string | undefined, fallback = ''): { list: IpList; invalid: string[] } {
	const block = new BlockList();
	const entries: string[] = [];
	const invalid: string[] = [];
	for (const raw of (spec ?? fallback).split(',')) {
		const s = raw.trim();
		if (!s) continue;
		const [addr, bits] = s.split('/');
		const type = isIP(unmap(addr));
		const prefix = bits === undefined ? undefined : Number(bits);
		if (!type || (prefix !== undefined && !(Number.isInteger(prefix) && prefix >= 0 && prefix <= (type === 4 ? 32 : 128)))) {
			invalid.push(s);
			continue;
		}
		const family = type === 4 ? 'ipv4' : 'ipv6';
		if (prefix === undefined) block.addAddress(unmap(addr), family);
		else block.addSubnet(unmap(addr), prefix, family);
		entries.push(s);
	}
	return {
		list: {
			entries,
			has(ip: string) {
				const a = unmap(ip ?? '');
				const type = isIP(a);
				return !!type && block.check(a, type === 4 ? 'ipv4' : 'ipv6');
			}
		},
		invalid
	};
}

const csv = (v: string | undefined) =>
	(v ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

export function authConfig(env: Record<string, string | undefined> = process.env, exists: (path: string) => boolean = existsSync): AuthConfig {
	const warnings: string[] = [];
	const rawMode = (env.AUTH_MODE ?? '').trim().toLowerCase() || 'tailscale';
	let mode: AuthMode = 'tailscale';
	if ((AUTH_MODES as string[]).includes(rawMode)) mode = rawMode as AuthMode;
	else warnings.push(`AUTH_MODE=${rawMode}: nieznany tryb – używam „tailscale”.`);
	// Puste (np. z compose.yaml `${X:-}`) = domyślne.
	const local = env.LOCAL_NETS?.trim() || DEFAULT_LOCAL;
	const proxies = parseIpList(env.TRUSTED_PROXIES?.trim() || undefined, local);
	const kiosk = parseIpList(env.KIOSK_IPS?.trim() || undefined, local);
	for (const bad of [...proxies.invalid, ...kiosk.invalid]) warnings.push(`Pomijam niepoprawny adres: ${bad}`);
	let apiToken = env.API_TOKEN?.trim() || null;
	if (apiToken && apiToken.length < 24) {
		warnings.push('API_TOKEN jest krótszy niż 24 znaki – wyłączony. Wygeneruj np.: openssl rand -hex 32');
		apiToken = null;
	}
	let passwordHash = env.AUTH_PASSWORD_HASH?.trim() || null;
	if (passwordHash && !isSecretHash(passwordHash)) {
		warnings.push('AUTH_PASSWORD_HASH nie jest skrótem scrypt (node server/hash-password.js) – pomijam.');
		passwordHash = null;
	}
	let sessionSecret = env.SESSION_SECRET?.trim() || null;
	if (sessionSecret && sessionSecret.length < 32) {
		warnings.push('SESSION_SECRET krótszy niż 32 znaki – używam sekretu z bazy.');
		sessionSecret = null;
	}
	const secure = (env.COOKIE_SECURE ?? 'auto').trim().toLowerCase();
	const days = Number(env.SESSION_DAYS ?? 30);
	// TAILSCALE_WHOIS: auto (domyślnie – gdy jest gniazdo tailscaled), 1 – zawsze (bez gniazda loginy odrzucane), 0 – nigdy.
	const whoisMode = (env.TAILSCALE_WHOIS ?? 'auto').trim().toLowerCase();
	const socket = env.TAILSCALE_SOCKET?.trim() || '/var/run/tailscale/tailscaled.sock';
	let tailscaleWhois: string | null = null;
	if (mode === 'tailscale' && whoisMode !== '0' && whoisMode !== 'off') {
		const found = exists(socket);
		if (found || whoisMode === '1' || whoisMode === 'on') tailscaleWhois = socket;
		if (!found && (whoisMode === '1' || whoisMode === 'on')) warnings.push(`TAILSCALE_WHOIS=1, ale nie ma gniazda ${socket} – loginy Tailscale będą odrzucane.`);
	}
	if (env.ADMIN_DEV === '1') warnings.push('ADMIN_DEV=1 – panel bez logowania. Tylko do developmentu!');
	return {
		mode,
		adminLogins: csv(env.ADMIN_LOGINS),
		adminDev: env.ADMIN_DEV === '1',
		proxyHeader: (env.AUTH_PROXY_HEADER?.trim() || 'Remote-User').toLowerCase(),
		trustedProxies: proxies.list,
		kioskIps: kiosk.list,
		kioskLocal: env.KIOSK_LOCAL !== '0',
		apiToken,
		passwordHash,
		sessionSecret,
		cookieSecure: secure === '1' || secure === 'always' || secure === 'true' ? 'always' : secure === '0' || secure === 'never' || secure === 'false' ? 'never' : 'auto',
		sessionDays: Number.isFinite(days) && days >= 1 && days <= 365 ? days : 30,
		tailscaleWhois,
		warnings
	};
}

/** To, co hook wie o żądaniu: adres połączenia (nie z nagłówków) i nagłówki. */
export interface RequestInfo {
	ip: string;
	headers: Headers;
}

/** Nagłówki, które dokleja proxy – żądanie z nimi nigdy nie jest kioskiem. */
const FORWARDED = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'tailscale-user-login', 'via', 'cf-connecting-ip'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostName(host: string | null): string {
	if (!host) return '';
	const h = host.trim().toLowerCase();
	if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
	return h.split(':')[0];
}

/**
 * Kiosk: Chromium na tym samym komputerze otwiera `http://localhost:PORT`. Wymagamy naraz: adresu
 * z KIOSK_IPS, nazwy `localhost`/`127.0.0.1` w nagłówku Host i braku nagłówków proxy. Żądanie przez
 * `tailscale serve` albo reverse proxy ma inny Host i X-Forwarded-For, więc kioskiem nie jest.
 */
export function isKiosk(req: RequestInfo, cfg: AuthConfig): boolean {
	if (!cfg.kioskLocal || !cfg.kioskIps.has(req.ip)) return false;
	if (!LOCAL_HOSTS.has(hostName(req.headers.get('host')))) return false;
	const extra = cfg.mode === 'proxy' ? [...FORWARDED, cfg.proxyHeader] : FORWARDED;
	return !extra.some((h) => req.headers.has(h));
}

/** Login z nagłówka Tailscale albo proxy – tylko od zaufanego pośrednika. */
export function forwardedLogin(req: RequestInfo, cfg: AuthConfig): string | null {
	if (cfg.mode === 'password') return null;
	if (!cfg.trustedProxies.has(req.ip)) return null;
	const header = cfg.mode === 'tailscale' ? 'tailscale-user-login' : cfg.proxyHeader;
	const login = req.headers.get(header)?.trim().toLowerCase();
	// Rozsądna długość i bez znaków sterujących – login trafia do logów i bazy (kto zatwierdził).
	return login && login.length <= 254 && !/[\0-\x1f\x7f]/.test(login) ? login : null;
}

export function isAdminLogin(login: string | null, cfg: AuthConfig): boolean {
	if (!login) return false;
	if (cfg.mode === 'password') return true;
	// Bez listy – każdy zalogowany (tailnet albo proxy i tak wpuszcza tylko swoich).
	return !cfg.adminLogins.length || cfg.adminLogins.includes(login);
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * `Authorization: Bearer …` – true przy dobrym tokenie, false przy złym, null gdy to nie jest próba tokenu:
 * brak nagłówka, inny schemat (np. `Basic` od reverse proxy z logowaniem) albo brak API_TOKEN w .env.
 * Wtedy decyduje zwykłe logowanie (kiosk, Tailscale, proxy, sesja) – bez niego i tak 401.
 */
export function bearerToken(headers: Headers, cfg: AuthConfig): boolean | null {
	const h = headers.get('authorization')?.trim();
	if (!h || !/^Bearer(\s|$)/i.test(h) || !cfg.apiToken) return null;
	const m = /^Bearer\s+(\S+)$/i.exec(h);
	if (!m) return false;
	return timingSafeEqual(digest(m[1]), digest(cfg.apiToken));
}

/**
 * Adres klienta do limitu prób: za zaufanym proxy – ostatni adres z X-Forwarded-For spoza
 * TRUSTED_PROXIES (pierwszych wpisów nie bierzemy, klient może je podrobić).
 */
export function clientAddress(req: RequestInfo, cfg: AuthConfig): string {
	if (!cfg.trustedProxies.has(req.ip)) return req.ip;
	const chain = (req.headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (let i = chain.length - 1; i >= 0; i--) if (!cfg.trustedProxies.has(chain[i])) return chain[i];
	return req.ip;
}

export interface Identity {
	/** Ekran kiosku na tym samym komputerze. */
	kiosk: boolean;
	/** Zalogowany użytkownik (Tailscale, proxy, hasło); null = anonim albo kiosk. */
	login: string | null;
	via: 'tailscale' | 'proxy' | 'password' | null;
	admin: boolean;
	/** Ważny API_TOKEN (tylko /api). */
	token: boolean;
	/** Podany, ale zły token – 401 na /api, nawet z kiosku. */
	badToken: boolean;
}

/**
 * @param verifiedLogin wynik `verifiedTailscaleLogin` (whois); `undefined` – login wprost z nagłówka.
 */
export function identify(req: RequestInfo, cfg: AuthConfig, sessionLogin: string | null = null, verifiedLogin?: string | null): Identity {
	const kiosk = isKiosk(req, cfg);
	const login = cfg.mode === 'password' ? sessionLogin : verifiedLogin !== undefined ? verifiedLogin : forwardedLogin(req, cfg);
	const bearer = bearerToken(req.headers, cfg);
	return {
		kiosk,
		login,
		via: login ? cfg.mode : null,
		admin: cfg.adminDev || isAdminLogin(login, cfg),
		token: bearer === true,
		badToken: bearer === false
	};
}

export type Access = 'ok' | 'login' | 'unauthorized' | 'forbidden';

/** Strony bez logowania w każdym trybie. */
const PUBLIC = ['/login', '/logout', '/prywatnosc', '/healthz'];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/** Decyzja dla ścieżki: wpuścić, odesłać do logowania, 401 albo 403. */
export function access(path: string, who: Identity, cfg: AuthConfig): Access {
	if (PUBLIC.some((p) => under(path, p))) return 'ok';
	const signedIn = who.kiosk || !!who.login;
	if (under(path, '/api')) {
		if (who.badToken) return 'unauthorized';
		return signedIn || who.token || cfg.adminDev ? 'ok' : 'unauthorized';
	}
	if (under(path, '/admin')) {
		if (who.admin) return 'ok';
		if (cfg.mode === 'password' && !who.login && !who.kiosk) return 'login';
		return 'forbidden';
	}
	// Tailscale: tailnet jest prywatny – strony kiosku i telefonu jak dotąd bez dodatkowego logowania.
	if (cfg.mode === 'tailscale' || signedIn || cfg.adminDev) return 'ok';
	return cfg.mode === 'password' ? 'login' : 'unauthorized';
}

/** Czy ustawić Secure na ciasteczku: z `Origin` formularza (https) albo z X-Forwarded-Proto od zaufanego proxy. */
export function secureCookie(req: RequestInfo, cfg: AuthConfig): boolean {
	if (cfg.cookieSecure !== 'auto') return cfg.cookieSecure === 'always';
	if (req.headers.get('origin')?.startsWith('https://')) return true;
	return cfg.trustedProxies.has(req.ip) && req.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
}
