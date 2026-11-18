import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, authConfig, identify, type RequestInfo } from './auth';
import { cachedWhois, verifiedTailscaleLogin, whois } from './tailscale-whois';

// Atrapa tailscaled: LocalAPI na gnieździe unix, jak /var/run/tailscale/tailscaled.sock.
const dir = mkdtempSync(join(tmpdir(), 'tsw-'));
const sock = join(dir, 'tailscaled.sock');
const PEERS: Record<string, object> = {
	'100.64.0.5': { Node: { Name: 'telefon-anny' }, UserProfile: { LoginName: 'Anna@example.com' } },
	'100.64.0.9': { Node: { Name: 'serwer', Tags: ['tag:server'] }, UserProfile: { LoginName: 'tagged-devices' } }
};
let hits = 0;
const server = http.createServer((req, res) => {
	hits++;
	const u = new URL(req.url ?? '/', 'http://local-tailscaled.sock');
	if (u.pathname !== '/localapi/v0/whois') return res.writeHead(404).end();
	const peer = PEERS[u.searchParams.get('addr') ?? ''];
	if (!peer) return res.writeHead(404).end('no match for IP:port');
	res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(peer));
});
beforeAll(() => new Promise<void>((r) => server.listen(sock, r)));
afterAll(() => {
	server.close();
	rmSync(dir, { recursive: true, force: true });
});

const req = (headers: Record<string, string>, ip = '127.0.0.1'): RequestInfo => ({ ip, headers: new Headers({ host: 'kalendarz.tail1.ts.net', ...headers }) });
const cfg = authConfig({ TAILSCALE_WHOIS: '1', TAILSCALE_SOCKET: sock });

describe('Tailscale whois (LocalAPI)', () => {
	it('konfiguracja: auto – tylko gdy jest gniazdo; 0 – wyłączone; 1 bez gniazda – ostrzeżenie', () => {
		expect(authConfig({ TAILSCALE_SOCKET: sock }).tailscaleWhois).toBe(sock);
		expect(authConfig({ TAILSCALE_SOCKET: join(dir, 'brak.sock') }).tailscaleWhois).toBeNull();
		expect(authConfig({ TAILSCALE_SOCKET: sock, TAILSCALE_WHOIS: '0' }).tailscaleWhois).toBeNull();
		expect(authConfig({ TAILSCALE_SOCKET: sock, AUTH_MODE: 'proxy' }).tailscaleWhois).toBeNull();
		const strict = authConfig({ TAILSCALE_SOCKET: join(dir, 'brak.sock'), TAILSCALE_WHOIS: '1' });
		expect(strict.tailscaleWhois).not.toBeNull();
		expect(strict.warnings.some((w) => w.includes('TAILSCALE_WHOIS'))).toBe(true);
	});

	it('whois: login właściciela, urządzenie z tagiem i nieznany adres → null', async () => {
		expect(await whois(sock, '100.64.0.5')).toBe('anna@example.com');
		expect(await whois(sock, '100.64.0.9')).toBeNull();
		expect(await whois(sock, '100.64.0.77')).toBeNull();
		await expect(whois(join(dir, 'brak.sock'), '100.64.0.5')).rejects.toThrow();
	});

	it('nagłówek zgodny z whois adresu z X-Forwarded-For – zalogowany', async () => {
		const r = req({ 'tailscale-user-login': 'anna@example.com', 'x-forwarded-for': '100.64.0.5' });
		const login = await verifiedTailscaleLogin(r, cfg, cachedWhois(sock));
		expect(login).toBe('anna@example.com');
		expect(access('/admin', identify(r, cfg, null, login), cfg)).toBe('ok');
	});

	it('podrobiony nagłówek z localhost: wymyślony login, cudzy adres, adres spoza tailnetu – odrzucone', async () => {
		const lookup = cachedWhois(sock);
		const cases: Record<string, string>[] = [
			{ 'tailscale-user-login': 'admin@example.com', 'x-forwarded-for': '100.64.0.5' },
			{ 'tailscale-user-login': 'anna@example.com', 'x-forwarded-for': '100.64.0.77' },
			{ 'tailscale-user-login': 'anna@example.com', 'x-forwarded-for': '192.168.1.5' },
			{ 'tailscale-user-login': 'anna@example.com' }
		];
		for (const h of cases) {
			const r = req(h);
			const login = await verifiedTailscaleLogin(r, cfg, lookup);
			expect(login).toBeNull();
			const who = identify(r, cfg, null, login);
			expect(who.login).toBeNull();
			expect(access('/admin', who, cfg)).toBe('forbidden');
		}
	});

	it('tailscaled nie odpowiada – odrzucenie (bez panelu); bez sprawdzania – sam nagłówek jak dotąd', async () => {
		const r = req({ 'tailscale-user-login': 'anna@example.com', 'x-forwarded-for': '100.64.0.5' });
		const dead = authConfig({ TAILSCALE_WHOIS: '1', TAILSCALE_SOCKET: join(dir, 'brak.sock') });
		expect(await verifiedTailscaleLogin(r, dead, cachedWhois(join(dir, 'brak.sock')))).toBeNull();
		const off = authConfig({ TAILSCALE_WHOIS: '0' });
		expect(await verifiedTailscaleLogin(r, off, null)).toBeUndefined();
		expect(identify(r, off, null, undefined).login).toBe('anna@example.com');
	});

	it('pamięć wyników – tailscaled pytany raz na adres', async () => {
		const lookup = cachedWhois(sock);
		const before = hits;
		await lookup('100.64.0.5');
		await lookup('100.64.0.5');
		expect(hits - before).toBe(1);
	});
});
