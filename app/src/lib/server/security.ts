import { randomBytes, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { secrets, settings } from './db/schema.js';
import { hashSecret, isSecretHash, PASSWORD_MIN, PIN_PATTERN, verifySecret } from './secret-hash.js';
import { derivedKey, signToken, verifyToken } from './session.js';
import { Throttle } from './throttle.js';
import { InputError } from './store.js';
import { getSetting, setSetting } from './sync.js';
import type { AuthConfig } from './auth.js';
import { t } from '#lib/i18n/index.js';

/**
 * Sekrety bezpieczeństwa w tabeli `secrets`: skrót PIN-u kiosku, skrót hasła (tryb `password`)
 * i sekret do podpisywania ciasteczek. Nic z tego nie trafia do przeglądarki.
 *
 * Security secrets: PIN hash, password hash and the cookie signing secret.
 */

const PIN_KEY = 'kiosk.pin';
const PASSWORD_KEY = 'auth.password';
const SECRET_KEY = 'auth.sessionSecret';

export const SESSION_COOKIE = 'kal_session';
export const PIN_COOKIE = 'kal_pin';
export const MEMBER_COOKIE = 'kal_member';
/** Jak długo po PIN-ie kiosk może usuwać i zmieniać ustawienia bez ponownego pytania. */
export const PIN_GRANT_MS = 2 * 60_000;

function getSecret(db: DB, key: string): string | null {
	return db.select().from(secrets).where(eq(secrets.key, key)).get()?.value ?? null;
}

function setSecret(db: DB, key: string, value: string | null) {
	if (value === null) return void db.delete(secrets).where(eq(secrets.key, key)).run();
	db.insert(secrets).values({ key, value }).onConflictDoUpdate({ target: secrets.key, set: { value } }).run();
}

/**
 * Przy starcie: dawny PIN zapisany jawnie w `settings.pin` (domyślne 1234 nie było nigdzie używane)
 * zamieniamy na skrót w `secrets` i usuwamy jawny zapis. Bez zapisu – brak PIN-u.
 */
export async function migratePlainPin(db: DB): Promise<boolean> {
	const row = db.select().from(settings).where(eq(settings.key, 'pin')).get();
	if (!row) return false;
	const value = typeof row.value === 'string' || typeof row.value === 'number' ? String(row.value) : '';
	if (PIN_PATTERN.test(value) && !getSecret(db, PIN_KEY)) setSecret(db, PIN_KEY, await hashSecret(value));
	db.delete(settings).where(eq(settings.key, 'pin')).run();
	return true;
}

// --- PIN kiosku ---

export const pinHash = (db: DB) => {
	const h = getSecret(db, PIN_KEY);
	return isSecretHash(h) ? h : null;
};
export const hasPin = (db: DB) => !!pinHash(db);

export async function setPin(db: DB, pin: string, repeat: string) {
	if (!PIN_PATTERN.test(pin)) throw new InputError(t('err.pin'));
	if (pin !== repeat) throw new InputError(t('sec.err.pinRepeat'));
	setSecret(db, PIN_KEY, await hashSecret(pin));
}

export function removePin(db: DB) {
	setSecret(db, PIN_KEY, null);
}

export const pinOnDelete = (db: DB) => getSetting(db, 'pinOnDelete') === true;
export const setPinOnDelete = (db: DB, on: boolean) => setSetting(db, 'pinOnDelete', on);

/** PIN na kiosku: wspólny licznik (jeden ekran) – 3 pomyłki, potem 15 s, 30 s, … do 15 min. */
export const pinThrottle = new Throttle({ free: 3, baseMs: 15_000, maxMs: 15 * 60_000 });

export type PinResult = { ok: true } | { ok: false; retryMs: number; left: number };

export async function checkPin(db: DB, pin: string, now = Date.now()): Promise<PinResult> {
	const wait = pinThrottle.wait('kiosk', now);
	if (wait) return { ok: false, retryMs: wait, left: 0 };
	// Próbę liczymy przed sprawdzeniem (scrypt jest asynchroniczny) – równoległe żądania nie ominą limitu.
	const retryMs = pinThrottle.fail('kiosk', now);
	const hash = pinHash(db);
	if (hash && typeof pin === 'string' && PIN_PATTERN.test(pin) && (await verifySecret(pin, hash))) {
		pinThrottle.success('kiosk');
		return { ok: true };
	}
	return { ok: false, retryMs, left: pinThrottle.left('kiosk', now) };
}

// --- Sekret podpisów ---

/** SESSION_SECRET z .env albo losowy, zapisany raz w `secrets`. */
export function signingSecret(db: DB, cfg: AuthConfig): string {
	if (cfg.sessionSecret) return cfg.sessionSecret;
	let s = getSecret(db, SECRET_KEY);
	if (!s || s.length < 32) {
		s = randomBytes(32).toString('base64url');
		setSecret(db, SECRET_KEY, s);
	}
	return s;
}

/** Zgoda po PIN-ie (ciasteczko kiosku) – ważna, dopóki PIN się nie zmieni. */
export function pinGrant(db: DB, cfg: AuthConfig, now = Date.now()): string {
	return signToken(derivedKey(signingSecret(db, cfg), 'pin', pinHash(db) ?? ''), { k: 1 }, PIN_GRANT_MS, now);
}

export function hasPinGrant(db: DB, cfg: AuthConfig, cookie: string | undefined, now = Date.now()): boolean {
	const hash = pinHash(db);
	if (!hash) return false;
	return !!verifyToken(derivedKey(signingSecret(db, cfg), 'pin', hash), cookie, now);
}

// --- Hasło (AUTH_MODE=password) ---

/** Hasło z .env wygrywa z hasłem ustawionym w aplikacji. */
export function passwordHash(db: DB, cfg: AuthConfig): string | null {
	if (cfg.passwordHash) return cfg.passwordHash;
	const h = getSecret(db, PASSWORD_KEY);
	return isSecretHash(h) ? h : null;
}

function checkNewPassword(cfg: AuthConfig, password: string, repeat: string) {
	if (cfg.passwordHash) throw new InputError(t('sec.err.passwordEnv'));
	if (password.length < PASSWORD_MIN) throw new InputError(t('sec.err.passwordShort', { min: PASSWORD_MIN }));
	if (password.length > 256) throw new InputError(t('sec.err.passwordLong'));
	if (password !== repeat) throw new InputError(t('sec.err.passwordRepeat'));
}

export async function setPassword(db: DB, cfg: AuthConfig, password: string, repeat: string) {
	checkNewPassword(cfg, password, repeat);
	setSecret(db, PASSWORD_KEY, await hashSecret(password));
	setupCode = null;
}

const sessionKey = (db: DB, cfg: AuthConfig) => derivedKey(signingSecret(db, cfg), 'session', passwordHash(db, cfg) ?? '');

export function createSession(db: DB, cfg: AuthConfig, now = Date.now()): string {
	return signToken(sessionKey(db, cfg), { u: 'admin' }, cfg.sessionDays * 86_400_000, now);
}

/** Login z ważnej sesji (podpis, termin, to samo hasło) albo null. */
export function sessionLogin(db: DB, cfg: AuthConfig, cookie: string | undefined, now = Date.now()): string | null {
	if (!cookie || !passwordHash(db, cfg)) return null;
	const data = verifyToken<{ u: string }>(sessionKey(db, cfg), cookie, now);
	return data && typeof data.u === 'string' ? data.u : null;
}

/** Logowanie: 5 pomyłek z jednego adresu, potem 30 s, 60 s, … do 15 min; dodatkowo limit dla wszystkich razem. */
export const loginThrottle = new Throttle({ free: 5, baseMs: 30_000, maxMs: 15 * 60_000 });
export const globalLoginThrottle = new Throttle({ free: 50, baseMs: 10_000, maxMs: 5 * 60_000, forgetMs: 15 * 60_000 });

export type LoginResult = { ok: true } | { ok: false; retryMs: number };

export async function tryLogin(db: DB, cfg: AuthConfig, password: string, client: string, now = Date.now()): Promise<LoginResult> {
	const wait = Math.max(loginThrottle.wait(client, now), globalLoginThrottle.wait('*', now));
	if (wait) return { ok: false, retryMs: wait };
	// Próbę rezerwujemy przed scryptem: równoległe żądania widzą ją od razu, więc nie ominą limitu.
	const retryMs = loginThrottle.fail(client, now);
	globalLoginThrottle.fail('*', now);
	const hash = passwordHash(db, cfg);
	if (hash && password.length <= 256 && (await verifySecret(password, hash))) {
		loginThrottle.success(client);
		globalLoginThrottle.refund('*', now);
		return { ok: true };
	}
	return { ok: false, retryMs };
}

// --- Pierwsze uruchomienie bez hasła ---

let setupCode: string | null = null;

/**
 * Tryb `password` bez hasła: hasło ustawia ten, kto zna kod z ekranu kiosku (ustawienia kiosku)
 * albo z logów serwera – dowód fizycznego dostępu. Kod zmienia się po każdym restarcie i po użyciu.
 */
export function firstRunCode(db: DB, cfg: AuthConfig): string | null {
	if (cfg.mode !== 'password' || passwordHash(db, cfg)) return null;
	setupCode ??= String(randomInt(0, 100_000_000)).padStart(8, '0');
	return setupCode;
}

export async function setFirstPassword(db: DB, cfg: AuthConfig, code: string, password: string, repeat: string, client: string, now = Date.now()): Promise<LoginResult> {
	const wait = Math.max(loginThrottle.wait(client, now), globalLoginThrottle.wait('*', now));
	if (wait) return { ok: false, retryMs: wait };
	// Najpierw hasło (błąd nie zdradza, czy kod był dobry), potem kod.
	checkNewPassword(cfg, password, repeat);
	const expected = firstRunCode(db, cfg);
	if (!expected || code.replace(/\s/g, '') !== expected) {
		globalLoginThrottle.fail('*', now);
		return { ok: false, retryMs: loginThrottle.fail(client, now) };
	}
	await setPassword(db, cfg, password, repeat);
	loginThrottle.success(client);
	return { ok: true };
}

/** Zmiana hasła w panelu: wymaga obecnego (ktoś mógł zostawić otwartą sesję). */
export async function changePassword(db: DB, cfg: AuthConfig, current: string, password: string, repeat: string) {
	const wait = loginThrottle.wait('panel');
	if (wait) throw new InputError(t('sec.err.wait', { s: Math.ceil(wait / 1000) }));
	loginThrottle.fail('panel');
	if (!(await verifySecret(current, passwordHash(db, cfg)))) throw new InputError(t('sec.err.currentPassword'));
	loginThrottle.success('panel');
	await setPassword(db, cfg, password, repeat);
}
