import { dirname, join, resolve } from 'node:path';
import { isLang, type Lang } from '#lib/i18n/index.js';

/**
 * Tryb demo (`DEMO=1`): aplikacja startuje z fikcyjną rodziną (`pack.ts`) w języku `DEMO_LANG`
 * (pl – rodzina w Poznaniu, de i en – w Hanowerze), z wbudowanymi atrapami pogody, odjazdów
 * i Home Assistanta (`fetch.ts` – bez sieci). Zapis działa, ale baza wraca do stanu demo przy każdym
 * starcie i co noc. Demo ma własną bazę i zdjęcia (`<katalog bazy>/demo/`) – prawdziwych danych nie dotyka.
 *
 * Demo mode: a fictional family, fake providers (no network), reset on start and nightly.
 */

export const isDemo = (env: Record<string, string | undefined> = process.env) => env.DEMO === '1' || env.DEMO === 'true';

export const demoLang = (env: Record<string, string | undefined> = process.env): Lang => {
	const l = (env.DEMO_LANG ?? 'pl').trim().toLowerCase();
	return isLang(l) ? l : 'pl';
};

/** Godzina nocnego resetu (czas lokalny regionu), `DEMO_RESET=off` – tylko przy starcie. */
export function demoResetTime(env: Record<string, string | undefined> = process.env): string | null {
	const v = (env.DEMO_RESET ?? '03:45').trim();
	if (v === 'off' || v === '0') return null;
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '03:45';
}

/**
 * Katalog demo obok zwykłej bazy. Ustawia `DATABASE_PATH`, `MEDIA_DIR` i `BACKUP_DIR` tego procesu,
 * zanim ktokolwiek otworzy bazę – wszystko, co czyta te zmienne, trafia do katalogu demo.
 */
export function applyDemoEnv(env: Record<string, string | undefined> = process.env) {
	const base = resolve(env.DATABASE_PATH ?? 'data/kalendarz.db');
	const dir = join(dirname(base), 'demo');
	env.DATABASE_PATH = join(dir, `kalendarz-demo-${demoLang(env)}.db`);
	env.MEDIA_DIR = join(dir, `media-${demoLang(env)}`);
	env.BACKUP_DIR = join(dir, 'kopie');
	return dir;
}

/**
 * Akcje panelu wyłączone w demo (publiczne demo nie może łączyć się z cudzymi kontami ani podmieniać
 * bazy): Google, Bring!, Home Assistant, kopie zapasowe i ich miejsca (WebDAV), przywracanie, dostęp
 * (hasło, PIN, token) i ponowne uruchomienie kreatora.
 */
export const DEMO_LOCKED_ACTIONS = new Set([
	'saveGoogleClient',
	'saveGoogleCalendars',
	'disconnectGoogle',
	'connectBring',
	'chooseBringList',
	'disconnectBring',
	'saveHaAuth',
	'disconnectHa',
	'saveHaEntities',
	'backupNow',
	'backupSchedule',
	'backupSaveTarget',
	'backupDeleteTarget',
	'backupTestTarget',
	'backupPassphrase',
	'backupClearPassphrase',
	'backupList',
	'backupPrepare',
	'backupCancel',
	'backupConfirm',
	'savePin',
	'removePin',
	'savePinOnDelete',
	'changePassword',
	'restartSetup',
	'loadSampleData'
]);

/** Sekcje panelu pokazywane w demo z informacją i bez możliwości zmian. */
export const DEMO_LOCKED_SECTIONS = ['google', 'home-assistant', 'kopie', 'dostep'] as const;

/** Trasy zamknięte w demo (logowanie Google, wgrywanie kopii). */
export const DEMO_LOCKED_ROUTES = ['/admin/google/start', '/admin/google/callback', '/admin/backup/upload'];

export const demoLockedAction = (name: string) => DEMO_LOCKED_ACTIONS.has(name);

export const demoLockedRoute = (path: string) => DEMO_LOCKED_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

/** PIN kiosku w demo – pokazany w panelu, żeby każdy mógł spróbować klawiatury PIN-u. */
export const DEMO_PIN = '1234';
