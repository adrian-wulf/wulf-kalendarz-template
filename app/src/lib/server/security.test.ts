import { describe, expect, it, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db/index';
import { secrets, settings } from './db/schema';
import { hashSecret, isSecretHash, verifySecret, type ScryptParams } from './secret-hash';
import { signToken, verifyToken, derivedKey } from './session';
import { Throttle } from './throttle';
import { authConfig } from './auth';
import * as S from './security';
import { pinGuarded } from './pin-guard';
import { hashPassword } from '../../../server/hash-password.js';
import { kioskSettingsAction, publicOrigin, qrSvg, brightnessOverride } from './kiosk-settings';
import { displayState } from './screen';

const FAST: ScryptParams = { N: 1 << 10, r: 8, p: 1 };

describe('skróty scrypt (PIN, hasło)', () => {
	it('weryfikacja, zła wartość, sól różna za każdym razem', async () => {
		const a = await hashSecret('1234', FAST);
		const b = await hashSecret('1234', FAST);
		expect(a).not.toBe(b);
		expect(a).not.toContain('1234');
		expect(a).not.toContain('$');
		expect(isSecretHash(a)).toBe(true);
		expect(await verifySecret('1234', a)).toBe(true);
		expect(await verifySecret('1235', a)).toBe(false);
	});
	it('jawny zapis i uszkodzone skróty nie przechodzą', async () => {
		expect(isSecretHash('1234')).toBe(false);
		expect(await verifySecret('1234', '1234')).toBe(false);
		expect(await verifySecret('1234', null)).toBe(false);
		// za duże parametry (DoS) – odrzucone przed liczeniem
		expect(isSecretHash(`scrypt:${2 ** 24}:8:1:${'a'.repeat(22)}:${'b'.repeat(43)}`)).toBe(false);
		expect(isSecretHash(`scrypt:1000:8:1:${'a'.repeat(22)}:${'b'.repeat(43)}`)).toBe(false);
	});
	it('skrót z server/hash-password.js działa w aplikacji', async () => {
		const h = await hashPassword('bardzo-dlugie-haslo', FAST);
		expect(isSecretHash(h)).toBe(true);
		expect(await verifySecret('bardzo-dlugie-haslo', h)).toBe(true);
		expect(authConfig({ AUTH_PASSWORD_HASH: h }).passwordHash).toBe(h);
	});
});

describe('podpisane żetony (sesja, zgoda po PIN-ie)', () => {
	const key = 'k'.repeat(32);
	it('ważny, wygasły, z innym kluczem, zmieniony', () => {
		const now = 1_000_000;
		const tok = signToken(key, { u: 'admin' }, 60_000, now);
		expect(verifyToken(key, tok, now + 1000)).toMatchObject({ u: 'admin' });
		expect(verifyToken(key, tok, now + 60_000)).toBeNull();
		expect(verifyToken('x'.repeat(32), tok, now)).toBeNull();
		const [body, sig] = tok.split('.');
		const forged = Buffer.from(JSON.stringify({ u: 'admin', iat: now, exp: now + 10 ** 9 })).toString('base64url');
		expect(verifyToken(key, `${forged}.${sig}`, now)).toBeNull();
		expect(verifyToken(key, `${body}.`, now)).toBeNull();
		expect(verifyToken(key, 'garbage', now)).toBeNull();
		expect(verifyToken(key, undefined, now)).toBeNull();
	});
	it('żeton „z przyszłości” odrzucony', () => {
		const tok = signToken(key, {}, 60_000, 10_000_000);
		expect(verifyToken(key, tok, 10_000_000 - 120_000)).toBeNull();
	});
	it('klucz pochodny zależy od celu i skrótu hasła', () => {
		expect(derivedKey('s', 'session', 'h1')).not.toBe(derivedKey('s', 'session', 'h2'));
		expect(derivedKey('s', 'session', 'h1')).not.toBe(derivedKey('s', 'pin', 'h1'));
	});
});

describe('limit prób', () => {
	it('kilka za darmo, potem podwajana przerwa do maksimum; sukces zeruje', () => {
		const th = new Throttle({ free: 3, baseMs: 1000, maxMs: 5000 });
		expect(th.fail('k', 0)).toBe(0);
		expect(th.fail('k', 0)).toBe(0);
		expect(th.left('k', 0)).toBe(1);
		expect(th.fail('k', 0)).toBe(1000);
		expect(th.wait('k', 500)).toBe(500);
		expect(th.wait('k', 1000)).toBe(0);
		expect(th.fail('k', 1000)).toBe(2000);
		expect(th.fail('k', 3000)).toBe(4000);
		expect(th.fail('k', 7000)).toBe(5000);
		expect(th.wait('inny', 7000)).toBe(0);
		th.success('k');
		expect(th.wait('k', 7000)).toBe(0);
	});
	it('stare wpisy zapomniane, liczba kluczy ograniczona', () => {
		const th = new Throttle({ free: 0, baseMs: 10, maxMs: 10, forgetMs: 100, maxKeys: 2 });
		th.fail('a', 0);
		expect(th.left('a', 5)).toBe(0);
		th.fail('b', 0);
		th.fail('c', 0);
		expect(th.wait('a', 1)).toBe(0); // wypchnięty
		expect(th.wait('c', 1)).toBe(9);
	});
});

describe('PIN kiosku w bazie', () => {
	let db: ReturnType<typeof openDb>;
	beforeEach(() => {
		db = openDb(':memory:');
		S.pinThrottle.success('kiosk');
	});

	it('domyślnie brak PIN-u (dawne 1234 nie obowiązuje)', () => {
		expect(S.hasPin(db)).toBe(false);
	});

	it('migracja: jawny settings.pin → skrót w secrets, jawny zapis usunięty', async () => {
		db.insert(settings).values({ key: 'pin', value: '4321' }).run();
		expect(await S.migratePlainPin(db)).toBe(true);
		expect(db.select().from(settings).where(eq(settings.key, 'pin')).get()).toBeUndefined();
		const stored = db.select().from(secrets).where(eq(secrets.key, 'kiosk.pin')).get()!.value;
		expect(stored).not.toContain('4321');
		expect((await S.checkPin(db, '4321')).ok).toBe(true);
		expect(await S.migratePlainPin(db)).toBe(false);
	});

	it('migracja: niepoprawny zapis po prostu znika', async () => {
		db.insert(settings).values({ key: 'pin', value: 'abc' }).run();
		await S.migratePlainPin(db);
		expect(S.hasPin(db)).toBe(false);
	});

	it('ustawienie, zła powtórka, zły format, usunięcie', async () => {
		await expect(S.setPin(db, '12', '12')).rejects.toThrow();
		await expect(S.setPin(db, '123456789', '123456789')).rejects.toThrow();
		await expect(S.setPin(db, '1234', '4321')).rejects.toThrow();
		await S.setPin(db, '20251', '20251');
		expect(S.hasPin(db)).toBe(true);
		S.removePin(db);
		expect(S.hasPin(db)).toBe(false);
	});

	it('pomyłki: 3 za darmo, potem przerwa – nawet dobry PIN musi poczekać', async () => {
		await S.setPin(db, '2468', '2468');
		const t0 = Date.now();
		expect(await S.checkPin(db, '0000', t0)).toEqual({ ok: false, retryMs: 0, left: 2 });
		expect(await S.checkPin(db, '0000', t0)).toEqual({ ok: false, retryMs: 0, left: 1 });
		const third = await S.checkPin(db, '0000', t0);
		expect(third.ok).toBe(false);
		expect(third.ok === false && third.retryMs).toBe(15_000);
		const locked = await S.checkPin(db, '2468', t0 + 1000);
		expect(locked.ok).toBe(false);
		expect((await S.checkPin(db, '2468', t0 + 16_000)).ok).toBe(true);
		// po sukcesie licznik od zera
		expect(await S.checkPin(db, '0000', t0 + 16_000)).toEqual({ ok: false, retryMs: 0, left: 2 });
	});

	it('równoległe próby PIN-u nie omijają limitu (próba liczona przed scryptem)', async () => {
		await S.setPin(db, '2468', '2468');
		S.pinThrottle.success('kiosk');
		const t0 = Date.now();
		const tries = Array.from({ length: 10 }, (_, i) => (i === 6 ? '2468' : '0000'));
		const res = await Promise.all(tries.map((p) => S.checkPin(db, p, t0)));
		// 3 darmowe + blokada – dobry PIN w siódmej równoległej próbie już nie przechodzi
		expect(res[6].ok).toBe(false);
		expect(res.filter((r) => r.ok).length).toBe(0);
		S.pinThrottle.success('kiosk');
	});

	it('zgoda po PIN-ie: ważna 2 min i tylko dla obecnego PIN-u', async () => {
		const cfg = authConfig({});
		await S.setPin(db, '2468', '2468');
		const now = Date.now();
		const grant = S.pinGrant(db, cfg, now);
		expect(S.hasPinGrant(db, cfg, grant, now + 60_000)).toBe(true);
		expect(S.hasPinGrant(db, cfg, grant, now + S.PIN_GRANT_MS + 1)).toBe(false);
		await S.setPin(db, '1357', '1357');
		expect(S.hasPinGrant(db, cfg, grant, now + 1000)).toBe(false);
		S.removePin(db);
		expect(S.hasPinGrant(db, cfg, S.pinGrant(db, cfg, now), now)).toBe(false);
	});
});

describe('hasło i sesje (AUTH_MODE=password)', () => {
	let db: ReturnType<typeof openDb>;
	const cfg = authConfig({ AUTH_MODE: 'password' });
	beforeEach(() => {
		db = openDb(':memory:');
		S.loginThrottle.success('1.2.3.4');
		S.loginThrottle.success('panel');
	});

	it('pierwsze uruchomienie: kod, walidacja hasła przed kodem, potem logowanie', async () => {
		const code = S.firstRunCode(db, cfg)!;
		expect(code).toMatch(/^\d{8}$/);
		await expect(S.setFirstPassword(db, cfg, code, 'krotkie', 'krotkie', '1.2.3.4')).rejects.toThrow();
		expect((await S.setFirstPassword(db, cfg, '00000000' === code ? '11111111' : '00000000', 'dlugie-haslo-1', 'dlugie-haslo-1', '1.2.3.4')).ok).toBe(false);
		expect((await S.setFirstPassword(db, cfg, code, 'dlugie-haslo-1', 'dlugie-haslo-1', '1.2.3.4')).ok).toBe(true);
		expect(S.firstRunCode(db, cfg)).toBeNull();
		expect(db.select().from(secrets).where(eq(secrets.key, 'auth.password')).get()!.value).not.toContain('dlugie');
		expect((await S.tryLogin(db, cfg, 'dlugie-haslo-1', '1.2.3.4')).ok).toBe(true);
		expect((await S.tryLogin(db, cfg, 'zle', '1.2.3.4')).ok).toBe(false);
	});

	it('równoległe logowania nie omijają limitu: dobre hasło w 10. próbie naraz – czekaj', async () => {
		await S.setPassword(db, cfg, 'dlugie-haslo-1', 'dlugie-haslo-1');
		const t0 = Date.now();
		const tries = Array.from({ length: 12 }, (_, i) => (i === 9 ? 'dlugie-haslo-1' : 'zle-haslo'));
		const res = await Promise.all(tries.map((p) => S.tryLogin(db, cfg, p, '1.2.3.4', t0)));
		expect(res[9].ok).toBe(false);
		expect(res.filter((r) => !r.ok && r.retryMs > 0).length).toBeGreaterThan(5);
		// dobre hasło po przerwie działa, a udane logowanie nie zostawia próby w liczniku wspólnym
		S.loginThrottle.success('1.2.3.4');
		const before = S.globalLoginThrottle.left('*', t0);
		expect((await S.tryLogin(db, cfg, 'dlugie-haslo-1', '1.2.3.4', t0)).ok).toBe(true);
		expect(S.globalLoginThrottle.left('*', t0)).toBe(before);
		S.globalLoginThrottle.success('*');
	});

	it('sesja: podpisana, wygasa, zmiana hasła wylogowuje', async () => {
		await S.setPassword(db, cfg, 'pierwsze-haslo', 'pierwsze-haslo');
		const now = Date.now();
		const cookie = S.createSession(db, cfg, now);
		expect(S.sessionLogin(db, cfg, cookie, now + 1000)).toBe('admin');
		expect(S.sessionLogin(db, cfg, cookie, now + 31 * 86_400_000)).toBeNull();
		expect(S.sessionLogin(db, cfg, cookie + 'x', now)).toBeNull();
		await S.changePassword(db, cfg, 'pierwsze-haslo', 'drugie-haslo!', 'drugie-haslo!');
		expect(S.sessionLogin(db, cfg, cookie, now + 1000)).toBeNull();
		await expect(S.changePassword(db, cfg, 'zle-haslo', 'trzecie-haslo', 'trzecie-haslo')).rejects.toThrow();
	});

	it('sekret podpisów: z .env albo losowy, zapisany raz', () => {
		const a = S.signingSecret(db, cfg);
		expect(a.length).toBeGreaterThanOrEqual(32);
		expect(S.signingSecret(db, cfg)).toBe(a);
		const env = authConfig({ AUTH_MODE: 'password', SESSION_SECRET: 's'.repeat(40) });
		expect(S.signingSecret(db, env)).toBe('s'.repeat(40));
	});

	it('logowanie: po 5 pomyłkach przerwa także dla dobrego hasła; inny adres niezależny', async () => {
		await S.setPassword(db, cfg, 'dobre-haslo-1', 'dobre-haslo-1');
		const t0 = Date.now();
		for (let i = 0; i < 5; i++) await S.tryLogin(db, cfg, 'zle', '5.5.5.5', t0);
		const r = await S.tryLogin(db, cfg, 'zle', '5.5.5.5', t0);
		expect(r.ok === false && r.retryMs).toBe(30_000);
		expect((await S.tryLogin(db, cfg, 'dobre-haslo-1', '5.5.5.5', t0 + 1000)).ok).toBe(false);
		expect((await S.tryLogin(db, cfg, 'dobre-haslo-1', '6.6.6.6', t0 + 1000)).ok).toBe(true);
		S.loginThrottle.success('5.5.5.5');
	});

	it('hasło z .env: panel go nie zmienia, aplikacja go używa', async () => {
		const h = await hashPassword('haslo-z-env-123', FAST);
		const env = authConfig({ AUTH_MODE: 'password', AUTH_PASSWORD_HASH: h });
		expect(S.firstRunCode(db, env)).toBeNull();
		expect((await S.tryLogin(db, env, 'haslo-z-env-123', '7.7.7.7')).ok).toBe(true);
		await expect(S.setPassword(db, env, 'inne-haslo-123', 'inne-haslo-123')).rejects.toThrow();
	});
});

describe('trasy za PIN-em', () => {
	it('usuwanie kartek, zapasów, odliczań; nie zakupy, zadania ani dodawanie', () => {
		expect(pinGuarded('DELETE', '/api/notes/abc')).toBe(true);
		expect(pinGuarded('delete', '/api/pantry/items/3')).toBe(true);
		expect(pinGuarded('DELETE', '/api/countdown/7')).toBe(true);
		expect(pinGuarded('DELETE', '/api/shopping/abc')).toBe(false);
		expect(pinGuarded('POST', '/api/notes')).toBe(false);
		expect(pinGuarded('POST', '/api/tasks/done')).toBe(false);
	});
});

describe('ustawienia kiosku', () => {
	it('adres publiczny: PUBLIC_ORIGIN, inaczej pierwszy https z TRUSTED_ORIGINS', () => {
		expect(publicOrigin({ PUBLIC_ORIGIN: 'https://k.ts.net/' })).toBe('https://k.ts.net');
		expect(publicOrigin({ TRUSTED_ORIGINS: 'http://localhost:3000, https://k.example.net' })).toBe('https://k.example.net');
		expect(publicOrigin({ TRUSTED_ORIGINS: 'http://localhost:3000' })).toBeNull();
	});
	it('kod QR to SVG', () => {
		const svg = qrSvg('https://k.ts.net/telefon');
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('<path d="M');
	});
	it('jasność na teraz: do zmiany pory dnia, walidacja, powrót do planu', async () => {
		const db = openDb(':memory:');
		const noon = new Date('2026-11-12T11:00:00Z');
		const plan = displayState(db, noon).level;
		await kioskSettingsAction(db, { action: 'brightness', value: 30 }, noon);
		expect(displayState(db, noon).level).toBe(30);
		expect(brightnessOverride(db, noon)).toBe(30);
		// noc: inna pora dnia → znów plan
		const night = new Date('2026-11-12T23:30:00Z');
		expect(displayState(db, night).level).toBe(displayState(openDb(':memory:'), night).level);
		await expect(kioskSettingsAction(db, { action: 'brightness', value: 2 }, noon)).rejects.toThrow();
		await kioskSettingsAction(db, { action: 'brightness', value: null }, noon);
		expect(displayState(db, noon).level).toBe(plan);
	});
	it('motyw i układ tylko z listy; nieznana czynność odrzucona', async () => {
		const db = openDb(':memory:');
		await expect(kioskSettingsAction(db, { action: 'theme', value: 'nope' })).rejects.toThrow();
		await expect(kioskSettingsAction(db, { action: 'layout', value: 'nope' })).rejects.toThrow();
		await expect(kioskSettingsAction(db, { action: 'drop-tables' })).rejects.toThrow();
		await kioskSettingsAction(db, { action: 'layout', value: 'month' });
		expect((await import('./layout')).getLayout(db).preset).toBe('month');
	});
});
