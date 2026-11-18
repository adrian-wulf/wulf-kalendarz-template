import { describe, expect, it } from 'vitest';
import { access, authConfig, bearerToken, clientAddress, identify, isAdminLogin, isKiosk, parseIpList, secureCookie, type RequestInfo } from './auth';

const req = (ip: string, headers: Record<string, string> = {}): RequestInfo => ({ ip, headers: new Headers({ host: 'localhost:3000', ...headers }) });
const TOKEN = 'a'.repeat(40);

describe('listy adresów (TRUSTED_PROXIES, KIOSK_IPS)', () => {
	it('adresy i podsieci IPv4/IPv6, adresy IPv4 w zapisie IPv6, błędne wpisy pominięte', () => {
		const { list, invalid } = parseIpList('127.0.0.1, 10.0.0.0/8, fd00::/8, nonsense, 1.2.3.4/40');
		expect(invalid).toEqual(['nonsense', '1.2.3.4/40']);
		expect(list.has('127.0.0.1')).toBe(true);
		expect(list.has('::ffff:127.0.0.1')).toBe(true);
		expect(list.has('10.20.30.40')).toBe(true);
		expect(list.has('fd12::1')).toBe(true);
		expect(list.has('192.168.1.10')).toBe(false);
		expect(list.has('')).toBe(false);
		expect(list.has('not-an-ip')).toBe(false);
	});
	it('domyślnie poza Dockerem: tylko localhost (172.16.0.0/12 może być LAN-em)', () => {
		const cfg = authConfig({});
		expect(cfg.trustedProxies.has('127.0.0.1')).toBe(true);
		expect(cfg.trustedProxies.has('::1')).toBe(true);
		expect(cfg.trustedProxies.has('172.18.0.1')).toBe(false);
		expect(cfg.kioskIps.has('172.17.0.1')).toBe(false);
		expect(cfg.trustedProxies.has('192.168.1.20')).toBe(false);
	});
	it('obraz Dockera (LOCAL_NETS z Dockerfile), także z pustymi zmiennymi z compose.yaml: localhost i sieć Dockera', () => {
		const docker = { LOCAL_NETS: '127.0.0.0/8,::1,172.16.0.0/12' };
		expect(authConfig({ ...docker, TRUSTED_PROXIES: '', KIOSK_IPS: ' ' }).kioskIps.has('172.17.0.1')).toBe(true);
		const cfg = authConfig(docker);
		expect(cfg.trustedProxies.has('127.0.0.1')).toBe(true);
		expect(cfg.trustedProxies.has('172.18.0.1')).toBe(true);
		expect(cfg.trustedProxies.has('192.168.1.20')).toBe(false);
		// jawne TRUSTED_PROXIES wygrywa
		expect(authConfig({ ...docker, TRUSTED_PROXIES: '10.0.0.2' }).trustedProxies.has('172.18.0.1')).toBe(false);
	});
});

describe('konfiguracja z .env', () => {
	it('domyślnie tryb tailscale, bez tokenu, kiosk lokalny', () => {
		const cfg = authConfig({});
		expect(cfg.mode).toBe('tailscale');
		expect(cfg.apiToken).toBeNull();
		expect(cfg.kioskLocal).toBe(true);
		expect(cfg.proxyHeader).toBe('remote-user');
	});
	it('nieznany tryb → tailscale z ostrzeżeniem; za krótki token i zły skrót hasła odrzucone', () => {
		const cfg = authConfig({ AUTH_MODE: 'open', API_TOKEN: 'short', AUTH_PASSWORD_HASH: 'plain', SESSION_SECRET: 'x' });
		expect(cfg.mode).toBe('tailscale');
		expect(cfg.apiToken).toBeNull();
		expect(cfg.passwordHash).toBeNull();
		expect(cfg.sessionSecret).toBeNull();
		expect(cfg.warnings.length).toBe(4);
	});
});

describe('kiosk = localhost bez nagłówków proxy', () => {
	const cfg = authConfig({});
	it('Chromium na tym komputerze', () => {
		expect(isKiosk(req('127.0.0.1'), cfg)).toBe(true);
		expect(isKiosk(req('::1', { host: '[::1]:3000' }), cfg)).toBe(true);
		// Docker: port z hosta widać z bramy sieci Dockera (LOCAL_NETS z Dockerfile)
		expect(isKiosk(req('172.17.0.1'), authConfig({ LOCAL_NETS: '127.0.0.0/8,::1,172.16.0.0/12' }))).toBe(true);
		expect(isKiosk(req('172.17.0.1'), cfg)).toBe(false);
	});
	it('przez tailscale serve / reverse proxy – nie kiosk', () => {
		expect(isKiosk(req('127.0.0.1', { host: 'kalendarz.tail1234.ts.net' }), cfg)).toBe(false);
		expect(isKiosk(req('127.0.0.1', { 'x-forwarded-for': '100.64.0.5' }), cfg)).toBe(false);
		expect(isKiosk(req('127.0.0.1', { forwarded: 'for=1.2.3.4' }), cfg)).toBe(false);
		expect(isKiosk(req('127.0.0.1', { 'tailscale-user-login': 'a@b.c' }), cfg)).toBe(false);
	});
	it('z sieci LAN, nawet z podrobionym Host: localhost – nie kiosk', () => {
		expect(isKiosk(req('192.168.1.50'), cfg)).toBe(false);
		expect(isKiosk(req('203.0.113.9'), cfg)).toBe(false);
	});
	it('KIOSK_LOCAL=0 wyłącza wyjątek', () => {
		expect(isKiosk(req('127.0.0.1'), authConfig({ KIOSK_LOCAL: '0' }))).toBe(false);
	});
	it('w trybie proxy nagłówek loginu też wyklucza kiosk', () => {
		expect(isKiosk(req('127.0.0.1', { 'remote-user': 'anna' }), authConfig({ AUTH_MODE: 'proxy' }))).toBe(false);
	});
});

describe('adapter Tailscale', () => {
	const cfg = authConfig({ ADMIN_LOGINS: 'Anna@example.com, inny@example.com' });
	it('login od tailscale serve (localhost) – rozpoznany; lista administratorów', () => {
		const anna = identify(req('127.0.0.1', { host: 'k.ts.net', 'tailscale-user-login': 'Anna@Example.com' }), cfg);
		expect(anna).toMatchObject({ kiosk: false, login: 'anna@example.com', via: 'tailscale', admin: true });
		const obcy = identify(req('127.0.0.1', { host: 'k.ts.net', 'tailscale-user-login': 'obcy@example.com' }), cfg);
		expect(obcy).toMatchObject({ login: 'obcy@example.com', admin: false });
	});
	it('podrobiony nagłówek spoza zaufanych adresów – ignorowany', () => {
		const who = identify(req('192.168.1.50', { host: 'k.local', 'tailscale-user-login': 'anna@example.com' }), cfg);
		expect(who).toMatchObject({ kiosk: false, login: null, admin: false });
	});
	it('bez listy – każdy zalogowany użytkownik tailnetu jest administratorem', () => {
		expect(isAdminLogin('x@y.z', authConfig({}))).toBe(true);
		expect(isAdminLogin(null, authConfig({}))).toBe(false);
	});
	it('nagłówek proxy w trybie tailscale nic nie daje', () => {
		expect(identify(req('127.0.0.1', { host: 'k', 'remote-user': 'anna' }), cfg).login).toBeNull();
	});
});

describe('adapter reverse proxy', () => {
	const cfg = authConfig({ AUTH_MODE: 'proxy', AUTH_PROXY_HEADER: 'X-Authentik-Username', TRUSTED_PROXIES: '10.0.0.2' });
	const h = { host: 'cal.example.com', 'x-forwarded-for': '198.51.100.7' };
	it('login z nagłówka od zaufanego proxy', () => {
		expect(identify(req('10.0.0.2', { ...h, 'x-authentik-username': 'Anna' }), cfg)).toMatchObject({ login: 'anna', via: 'proxy', admin: true });
	});
	it('ten sam nagłówek od innego adresu (podrobiony) – brak loginu, strony 401', () => {
		const who = identify(req('10.0.0.3', { ...h, 'x-authentik-username': 'anna' }), cfg);
		expect(who.login).toBeNull();
		expect(access('/', who, cfg)).toBe('unauthorized');
		expect(access('/api/notes', who, cfg)).toBe('unauthorized');
	});
	it('nagłówek Tailscale w trybie proxy – ignorowany', () => {
		expect(identify(req('10.0.0.2', { ...h, 'tailscale-user-login': 'anna' }), cfg).login).toBeNull();
	});
	it('znaki sterujące i zbyt długi login – odrzucone', () => {
		expect(identify(req('10.0.0.2', { ...h, 'x-authentik-username': 'a'.repeat(300) }), cfg).login).toBeNull();
	});
	it('adres klienta do limitu prób: ostatni spoza zaufanych w X-Forwarded-For', () => {
		expect(clientAddress(req('10.0.0.2', { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }), cfg)).toBe('198.51.100.7');
		// klient spoza zaufanych nie wybierze sobie adresu nagłówkiem
		expect(clientAddress(req('198.51.100.8', { 'x-forwarded-for': '1.1.1.1' }), cfg)).toBe('198.51.100.8');
	});
});

describe('token API', () => {
	const cfg = authConfig({ API_TOKEN: TOKEN });
	it('dobry, zły i brak nagłówka', () => {
		expect(bearerToken(new Headers({ authorization: `Bearer ${TOKEN}` }), cfg)).toBe(true);
		expect(bearerToken(new Headers({ authorization: `bearer ${TOKEN}` }), cfg)).toBe(true);
		expect(bearerToken(new Headers({ authorization: 'Bearer zly' }), cfg)).toBe(false);
		expect(bearerToken(new Headers({ authorization: 'Bearer' }), cfg)).toBe(false);
		expect(bearerToken(new Headers(), cfg)).toBeNull();
	});
	it('inny schemat (Basic od proxy) to nie próba tokenu', () => {
		expect(bearerToken(new Headers({ authorization: 'Basic abc' }), cfg)).toBeNull();
		expect(bearerToken(new Headers({ authorization: 'Bearerish x' }), cfg)).toBeNull();
		// zalogowany przez proxy z Basic Auth – /api działa
		const proxy = authConfig({ AUTH_MODE: 'proxy', API_TOKEN: TOKEN, TRUSTED_PROXIES: '10.0.0.2' });
		const who = identify(req('10.0.0.2', { host: 'cal.example.com', 'remote-user': 'anna', authorization: 'Basic YW5uYTpzZWtyZXQ=' }), proxy);
		expect(access('/api/notes', who, proxy)).toBe('ok');
		// a anonim z Basic – nadal 401
		const anon = identify(req('203.0.113.1', { host: 'cal.example.com', authorization: 'Basic abc' }), proxy);
		expect(access('/api/notes', anon, proxy)).toBe('unauthorized');
	});
	it('bez API_TOKEN Bearer jest pomijany: zalogowany wchodzi, anonim dostaje 401', () => {
		const none = authConfig({});
		expect(bearerToken(new Headers({ authorization: `Bearer ${TOKEN}` }), none)).toBeNull();
		const kiosk = identify(req('127.0.0.1', { authorization: `Bearer ${TOKEN}` }), none);
		expect(access('/api/display', kiosk, none)).toBe('ok');
		const anon = identify(req('127.0.0.1', { host: 'k.ts.net', 'x-forwarded-for': '100.64.0.9', authorization: `Bearer ${TOKEN}` }), none);
		expect(access('/api/display', anon, none)).toBe('unauthorized');
	});
	it('token otwiera /api, ale nie strony ani panel', () => {
		const pwd = authConfig({ AUTH_MODE: 'password', API_TOKEN: TOKEN });
		const who = identify(req('203.0.113.1', { host: 'cal.example.com', authorization: `Bearer ${TOKEN}` }), pwd);
		expect(access('/api/shopping', who, pwd)).toBe('ok');
		expect(access('/', who, pwd)).toBe('login');
		expect(access('/admin', who, pwd)).toBe('login');
	});
	it('zły token → 401 na /api nawet z kiosku', () => {
		const who = identify(req('127.0.0.1', { authorization: 'Bearer zly' }), cfg);
		expect(who.kiosk).toBe(true);
		expect(access('/api/display', who, cfg)).toBe('unauthorized');
	});
});

describe('decyzje dostępu', () => {
	it('tailscale: strony jak dotąd, /api tylko kiosk / login / token, panel tylko administratorzy', () => {
		const cfg = authConfig({});
		const anon = identify(req('127.0.0.1', { host: 'k.ts.net', 'x-forwarded-for': '100.64.0.9' }), cfg);
		expect(access('/', anon, cfg)).toBe('ok');
		expect(access('/telefon', anon, cfg)).toBe('ok');
		expect(access('/api/notes', anon, cfg)).toBe('unauthorized');
		expect(access('/admin', anon, cfg)).toBe('forbidden');
		const kiosk = identify(req('127.0.0.1'), cfg);
		expect(access('/api/notes', kiosk, cfg)).toBe('ok');
		expect(access('/admin', kiosk, cfg)).toBe('forbidden');
		const user = identify(req('127.0.0.1', { host: 'k.ts.net', 'tailscale-user-login': 'a@b.c' }), cfg);
		expect(access('/api/notes', user, cfg)).toBe('ok');
		expect(access('/admin/ustawienia', user, cfg)).toBe('ok');
	});
	it('hasło: bez sesji – logowanie (strony, panel), 401 (/api); z sesją – wszystko', () => {
		const cfg = authConfig({ AUTH_MODE: 'password' });
		const remote = req('203.0.113.1', { host: 'cal.example.com' });
		const anon = identify(remote, cfg);
		expect(access('/', anon, cfg)).toBe('login');
		expect(access('/admin', anon, cfg)).toBe('login');
		expect(access('/api/events', anon, cfg)).toBe('unauthorized');
		expect(access('/login', anon, cfg)).toBe('ok');
		expect(access('/prywatnosc', anon, cfg)).toBe('ok');
		expect(access('/healthz', anon, cfg)).toBe('ok');
		// proxy bez kiosku – healthcheck Dockera nadal przechodzi
		const proxy = authConfig({ AUTH_MODE: 'proxy', KIOSK_LOCAL: '0' });
		expect(access('/healthz', identify(req('127.0.0.1'), proxy), proxy)).toBe('ok');
		expect(access('/', identify(req('127.0.0.1'), proxy), proxy)).toBe('unauthorized');
		// podrobiony nagłówek Tailscale w trybie hasła nic nie daje
		expect(identify(req('127.0.0.1', { host: 'x', 'tailscale-user-login': 'a@b.c' }), cfg).login).toBeNull();
		const signed = identify(remote, cfg, 'admin');
		expect(signed).toMatchObject({ login: 'admin', via: 'password', admin: true });
		expect(access('/admin', signed, cfg)).toBe('ok');
		expect(access('/api/events', signed, cfg)).toBe('ok');
		// kiosk bez logowania – ale nie do panelu
		const kiosk = identify(req('127.0.0.1'), cfg);
		expect(access('/', kiosk, cfg)).toBe('ok');
		expect(access('/api/events', kiosk, cfg)).toBe('ok');
		expect(access('/admin', kiosk, cfg)).toBe('forbidden');
	});
	it('prefiksy liczone po segmentach (/apix, /administrator to nie /api, /admin)', () => {
		const cfg = authConfig({ AUTH_MODE: 'password' });
		const anon = identify(req('203.0.113.1', { host: 'x' }), cfg);
		expect(access('/apix', anon, cfg)).toBe('login');
		expect(access('/loginx', anon, cfg)).toBe('login');
	});
});

describe('ciasteczko Secure', () => {
	it('auto: https z Origin formularza albo X-Forwarded-Proto od zaufanego proxy', () => {
		const cfg = authConfig({});
		expect(secureCookie(req('127.0.0.1', { origin: 'https://k.ts.net' }), cfg)).toBe(true);
		expect(secureCookie(req('127.0.0.1', { origin: 'http://192.168.1.5:3000' }), cfg)).toBe(false);
		expect(secureCookie(req('127.0.0.1', { 'x-forwarded-proto': 'https' }), cfg)).toBe(true);
		expect(secureCookie(req('203.0.113.1', { 'x-forwarded-proto': 'https' }), cfg)).toBe(false);
	});
	it('COOKIE_SECURE wymusza', () => {
		expect(secureCookie(req('203.0.113.1'), authConfig({ COOKIE_SECURE: '1' }))).toBe(true);
		expect(secureCookie(req('127.0.0.1', { origin: 'https://x' }), authConfig({ COOKIE_SECURE: 'never' }))).toBe(false);
	});
});
