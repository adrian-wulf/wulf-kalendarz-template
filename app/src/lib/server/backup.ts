import { appFetch } from './net.js';
import { randomBytes } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq, like } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { secrets } from './db/schema.js';
import { getKv, setKv } from './kv.js';
import { InputError } from './store.js';
import { mediaRoot } from './media.js';
import { createArchive } from './backup/archive.js';
import { Webdav, folderUrl, WebdavError, type RemoteFile } from './backup/webdav.js';
import { addDays, isoWeekday, localParts, parseHHMM } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';

/**
 * Kopie zapasowe: archiwum (baza + zdjęcia + manifest, opcjonalnie zaszyfrowane) według harmonogramu
 * do kilku miejsc naraz – folder lokalny (także udział NAS zamontowany w kontenerze) i WebDAV
 * (Nextcloud, NAS). Każde miejsce ma własną rotację i ostatni wynik. Przywracanie: `backup/restore.ts`.
 *
 * Backups: one archive per run, copied to every enabled target (local folder or WebDAV), each with
 * its own retention and last status. Config lives in `settings` (`backup`, `backupState`), WebDAV
 * passwords and the optional passphrase in `secrets` – never sent to the browser.
 */

export type TargetKind = 'local' | 'webdav';
export type Freq = 'daily' | 'weekly' | 'off';

export interface Target {
	id: string;
	kind: TargetKind;
	name: string;
	/** local: bezwzględna ścieżka katalogu; '' = domyślny `backups/` obok bazy */
	path: string;
	/** webdav: adres katalogu */
	url: string;
	user: string;
	/** ile ostatnich kopii trzymać w tym miejscu */
	keep: number;
	enabled: boolean;
}

export interface BackupConfig {
	freq: Freq;
	/** 1 = poniedziałek … 7 = niedziela (dla `weekly`) */
	weekday: number;
	time: string;
	targets: Target[];
}

export interface TargetStatus {
	at: string;
	ok: boolean;
	file?: string;
	size?: number;
	error?: string;
}

export interface BackupState {
	/** ostatni termin z harmonogramu, który już obsłużono (data 'YYYY-MM-DD') */
	lastSlot: string | null;
	lastRun: { at: string; ok: boolean; reason: 'auto' | 'manual' } | null;
	targets: Record<string, TargetStatus>;
}

export const CONFIG_KEY = 'backup';
export const STATE_KEY = 'backupState';
export const SECRET_PREFIX = 'backup.';
const PASSPHRASE_KEY = 'backup.passphrase';
const davKey = (id: string) => `backup.webdav.${id}`;

export const MAX_TARGETS = 8;
export const DEFAULT_KEEP = 14;
const PRE_RESTORE_KEEP = 3;

/** Nazwy plików kopii: zwykłe, „przed przywróceniem” i stare kopie samej bazy (do wersji z archiwami). */
export const ARCHIVE_RE = /^kalendarz-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz(\.enc)?$/;
export const PRE_RESTORE_RE = /^kalendarz-przed-przywroceniem-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz(\.enc)?$/;
export const LEGACY_RE = /^kalendarz-\d{4}-\d{2}-\d{2}\.db$/;
export const isBackupName = (n: string) => ARCHIVE_RE.test(n) || PRE_RESTORE_RE.test(n) || LEGACY_RE.test(n);

const DEFAULT_LOCAL: Target = { id: 'local', kind: 'local', name: '', path: '', url: '', user: '', keep: DEFAULT_KEEP, enabled: true };
export const DEFAULT_CONFIG: BackupConfig = { freq: 'daily', weekday: 1, time: '03:30', targets: [DEFAULT_LOCAL] };
const FRESH_STATE: BackupState = { lastSlot: null, lastRun: null, targets: {} };

// --- miejsca i ustawienia -------------------------------------------------------------------

let defaultDir: string | undefined;

/** Katalog `backups/` obok bazy albo BACKUP_DIR (domyślne miejsce lokalne i kopie „przed przywróceniem”). */
export function backupDir(dbPath = process.env.DATABASE_PATH ?? 'data/kalendarz.db') {
	if (process.env.BACKUP_DIR) return resolve(process.env.BACKUP_DIR);
	return join(dirname(resolve(dbPath)), 'backups');
}

export const localBackupDir = () => defaultDir ?? backupDir();

/**
 * Katalog roboczy kopii i przywracania obok bazy (`.kalendarz.db.work/`) – na tym samym systemie
 * plików co baza i zdjęcia, osobny dla każdej bazy (kilka instancji może dzielić katalog danych).
 */
export function workDir(db: DB) {
	const name = db.$client.name;
	const file = resolve(name && name !== ':memory:' ? name : (process.env.DATABASE_PATH ?? 'data/kalendarz.db'));
	return join(dirname(file), `.${basename(file)}.work`);
}

export const targetDir = (tg: Target) => (tg.path ? tg.path : localBackupDir());

export function getConfig(db: DB): BackupConfig {
	const c = getKv<Partial<BackupConfig> | null>(db, CONFIG_KEY, null);
	return { ...DEFAULT_CONFIG, ...c, targets: c?.targets ?? DEFAULT_CONFIG.targets };
}

const saveConfig = (db: DB, c: BackupConfig) => setKv(db, CONFIG_KEY, c);

export function getState(db: DB): BackupState {
	return { ...FRESH_STATE, ...getKv<Partial<BackupState> | null>(db, STATE_KEY, null) };
}

const saveState = (db: DB, s: BackupState) => setKv(db, STATE_KEY, s);

function getSecret(db: DB, key: string): string | null {
	return db.select().from(secrets).where(eq(secrets.key, key)).get()?.value ?? null;
}

function setSecret(db: DB, key: string, value: string | null) {
	if (value === null) return void db.delete(secrets).where(eq(secrets.key, key)).run();
	db.insert(secrets).values({ key, value }).onConflictDoUpdate({ target: secrets.key, set: { value } }).run();
}

export const hasPassphrase = (db: DB) => !!getSecret(db, PASSPHRASE_KEY);
export const hasDavPassword = (db: DB, id: string) => !!getSecret(db, davKey(id));
export const storedPassphrase = (db: DB) => getSecret(db, PASSPHRASE_KEY);

/** Wszystko, co dotyczy kopii (ustawienia, stan, hasła) – przywracanie zostawia je bez zmian. */
export function exportBackupSettings(db: DB) {
	return {
		config: getKv<unknown>(db, CONFIG_KEY, null),
		state: getKv<unknown>(db, STATE_KEY, null),
		secrets: db.select().from(secrets).where(like(secrets.key, `${SECRET_PREFIX}%`)).all()
	};
}

export function importBackupSettings(db: DB, s: ReturnType<typeof exportBackupSettings>) {
	setKv(db, CONFIG_KEY, s.config);
	setKv(db, STATE_KEY, s.state);
	db.delete(secrets).where(like(secrets.key, `${SECRET_PREFIX}%`)).run();
	for (const row of s.secrets) db.insert(secrets).values(row).run();
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export function saveSchedule(db: DB, f: FormData, now = new Date()) {
	const freq = str(f, 'freq') as Freq;
	if (!['daily', 'weekly', 'off'].includes(freq)) throw new InputError(t('p4.backup.err.freq'));
	const time = str(f, 'time');
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new InputError(t('p4.backup.err.time'));
	const weekday = Number(str(f, 'weekday') || 1);
	if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new InputError(t('p4.backup.err.freq'));
	const next = { ...getConfig(db), freq, time, weekday };
	saveConfig(db, next);
	// Następna kopia w następnym terminie – zmiana harmonogramu nie uruchamia kopii od razu.
	saveState(db, { ...getState(db), lastSlot: dueSlot(next, now) });
}

/** Sprawdza ścieżkę folderu lokalnego: bezwzględna, poza zdjęciami, da się w niej pisać. */
async function checkLocalDir(path: string) {
	const dir = path || localBackupDir();
	if (path && !isAbsolute(path)) throw new InputError(t('p4.backup.err.pathAbsolute'));
	const media = resolve(mediaRoot());
	if (resolve(dir) === media || resolve(dir).startsWith(media + sep)) throw new InputError(t('p4.backup.err.pathMedia'));
	try {
		await mkdir(dir, { recursive: true });
		await access(dir, constants.W_OK);
	} catch (e) {
		throw new InputError(t('p4.backup.err.pathWrite', { path: dir, error: e instanceof Error ? e.message : String(e) }));
	}
}

export async function saveTarget(db: DB, f: FormData) {
	const cfg = getConfig(db);
	const id = str(f, 'id');
	const old = id ? cfg.targets.find((x) => x.id === id) : undefined;
	if (id && !old) throw new InputError(t('p4.backup.err.noTarget'));
	if (!old && cfg.targets.length >= MAX_TARGETS) throw new InputError(t('p4.backup.err.tooMany', { n: MAX_TARGETS }));
	const kind = (old?.kind ?? str(f, 'kind')) as TargetKind;
	if (kind !== 'local' && kind !== 'webdav') throw new InputError(t('p4.backup.err.kind'));
	const keep = Number(str(f, 'keep') || DEFAULT_KEEP);
	if (!Number.isInteger(keep) || keep < 1 || keep > 365) throw new InputError(t('p4.backup.err.keep'));
	const tg: Target = {
		id: old?.id ?? randomBytes(4).toString('hex'),
		kind,
		name: str(f, 'name').slice(0, 40),
		path: '',
		url: '',
		user: '',
		keep,
		// Formularz edycji ma ukryte `enabledField` obok pola wyboru; nowe miejsce jest włączone.
		enabled: f.has('enabledField') ? f.has('enabled') : (old?.enabled ?? true)
	};
	let password: string | null = null;
	if (kind === 'local') {
		tg.path = str(f, 'path');
		await checkLocalDir(tg.path);
	} else {
		try {
			tg.url = folderUrl(str(f, 'url')).href;
		} catch (e) {
			throw new InputError(e instanceof WebdavError ? e.message : t('p4.dav.protocol'));
		}
		tg.user = str(f, 'user');
		if (!tg.user) throw new InputError(t('p4.backup.err.user'));
		password = String(f.get('password') ?? '');
		if (!password && !getSecret(db, davKey(tg.id))) throw new InputError(t('p4.backup.err.password'));
	}
	saveConfig(db, { ...cfg, targets: old ? cfg.targets.map((x) => (x.id === tg.id ? tg : x)) : [...cfg.targets, tg] });
	if (password) setSecret(db, davKey(tg.id), password);
	return tg;
}

export function deleteTarget(db: DB, f: FormData) {
	const id = str(f, 'id');
	const cfg = getConfig(db);
	if (!cfg.targets.some((x) => x.id === id)) throw new InputError(t('p4.backup.err.noTarget'));
	saveConfig(db, { ...cfg, targets: cfg.targets.filter((x) => x.id !== id) });
	setSecret(db, davKey(id), null);
	const st = getState(db);
	delete st.targets[id];
	saveState(db, st);
}

export function savePassphrase(db: DB, f: FormData) {
	const p = String(f.get('passphrase') ?? '');
	if (p.length < 8) throw new InputError(t('p4.backup.err.passphraseShort'));
	if (p !== String(f.get('passphrase2') ?? '')) throw new InputError(t('p4.backup.err.passphraseMismatch'));
	setSecret(db, PASSPHRASE_KEY, p);
}

export const clearPassphrase = (db: DB) => setSecret(db, PASSPHRASE_KEY, null);

function findTarget(db: DB, id: string): Target {
	const tg = getConfig(db).targets.find((x) => x.id === id);
	if (!tg) throw new InputError(t('p4.backup.err.noTarget'));
	return tg;
}

export function webdavFor(db: DB, tg: Target, f: typeof fetch = appFetch) {
	const password = getSecret(db, davKey(tg.id));
	if (!password) throw new InputError(t('p4.backup.err.password'));
	return new Webdav({ url: tg.url, user: tg.user, password }, f);
}

/** „Sprawdź”: zapis i usunięcie pliku próbnego (lokalnie) albo katalog i lista (WebDAV). */
export async function testTarget(db: DB, id: string, f: typeof fetch = appFetch) {
	const tg = findTarget(db, id);
	try {
		if (tg.kind === 'local') {
			await checkLocalDir(tg.path);
			const probe = join(targetDir(tg), `.kalendarz-test-${randomBytes(4).toString('hex')}`);
			await writeFile(probe, 'ok');
			await rm(probe, { force: true });
		} else {
			const dav = webdavFor(db, tg, f);
			await dav.ensureFolder();
			await dav.list();
		}
	} catch (e) {
		throw new InputError(`${targetLabel(tg)}: ${errText(e)}`);
	}
}

export const targetLabel = (tg: Target) =>
	tg.name || (tg.kind === 'local' ? (tg.path ? tg.path : t('p4.backup.localDefault')) : new URL(tg.url).host);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --- harmonogram, rotacja -------------------------------------------------------------------

/** Ostatni termin z harmonogramu, który już minął (data), albo null przy wyłączonych kopiach. */
export function dueSlot(cfg: Pick<BackupConfig, 'freq' | 'weekday' | 'time'>, now: Date): string | null {
	if (cfg.freq === 'off') return null;
	const { date, minutes } = localParts(now);
	const before = minutes < parseHHMM(cfg.time);
	if (cfg.freq === 'daily') return before ? addDays(date, -1) : date;
	let back = (isoWeekday(date) - cfg.weekday + 7) % 7;
	if (back === 0 && before) back = 7;
	return addDays(date, -back);
}

/** Klucz sortowania: data i godzina z nazwy (stare kopie samej bazy – jak z północy tego dnia). */
const sortKey = (n: string) => {
	const m = n.match(/(\d{4}-\d{2}-\d{2})(?:-(\d{6}))?/);
	return `${m?.[1] ?? ''}-${m?.[2] ?? '000000'} ${n}`;
};

/** Pliki do usunięcia, gdy zostaje `keep` najnowszych zwykłych kopii (kopie „przed przywróceniem” osobno). */
export function toRotate(names: string[], keep: number): string[] {
	const regular = names.filter((n) => ARCHIVE_RE.test(n) || LEGACY_RE.test(n)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
	const pre = names.filter((n) => PRE_RESTORE_RE.test(n)).sort();
	return [...regular.slice(0, Math.max(0, regular.length - keep)), ...pre.slice(0, Math.max(0, pre.length - PRE_RESTORE_KEEP))];
}

export function archiveName(now: Date, encrypted: boolean, prefix = 'kalendarz-') {
	const { date, minutes } = localParts(now);
	const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;
	return `${prefix}${date}-${hhmm}${String(now.getSeconds()).padStart(2, '0')}.tar.gz${encrypted ? '.enc' : ''}`;
}

export interface BackupFile {
	name: string;
	size: number;
	modified: string | null;
}

export async function listLocal(dir: string): Promise<BackupFile[]> {
	const names = (await readdir(dir).catch(() => [] as string[])).filter(isBackupName);
	const files = await Promise.all(
		names.map(async (name): Promise<BackupFile | null> => {
			const s = await stat(join(dir, name)).catch(() => null);
			return s?.isFile() ? { name, size: s.size, modified: s.mtime.toISOString() } : null;
		})
	);
	return files.filter((x): x is BackupFile => !!x).sort((a, b) => sortKey(b.name).localeCompare(sortKey(a.name)));
}

export async function listTarget(db: DB, id: string, f: typeof fetch = appFetch): Promise<BackupFile[]> {
	const tg = findTarget(db, id);
	if (tg.kind === 'local') return listLocal(targetDir(tg));
	const files: RemoteFile[] = await webdavFor(db, tg, f).list();
	return files.filter((x) => isBackupName(x.name)).sort((a, b) => sortKey(b.name).localeCompare(sortKey(a.name)));
}

/** Kopia z danego miejsca do pliku `to` (przywracanie z listy). */
export async function fetchFromTarget(db: DB, id: string, name: string, to: string, f: typeof fetch = appFetch) {
	if (!isBackupName(name)) throw new InputError(t('p4.backup.err.notBackup'));
	const tg = findTarget(db, id);
	if (tg.kind === 'local') return void (await pipeline(createReadStream(join(targetDir(tg), name)), createWriteStream(to)));
	await webdavFor(db, tg, f).download(name, to);
}

/** Ścieżka pliku kopii w miejscu lokalnym (pobieranie z panelu); zła nazwa → null. */
export function localFile(db: DB, id: string, name: string): string | null {
	const tg = getConfig(db).targets.find((x) => x.id === id && x.kind === 'local');
	if (!tg || !isBackupName(name)) return null;
	return join(targetDir(tg), name);
}

// --- wykonanie ------------------------------------------------------------------------------

let busy: string | null = null;

/** Jedna operacja naraz (kopia albo przywracanie). */
export async function exclusive<T>(what: string, fn: () => Promise<T>): Promise<T> {
	if (busy) throw new InputError(t('p4.backup.err.busy'));
	busy = what;
	try {
		return await fn();
	} finally {
		busy = null;
	}
}

export const isBusy = () => busy;

const GB = 1024 ** 3;

/**
 * Wolne miejsce na dysku z folderem kopii (lub najbliższym istniejącym katalogiem nad nim). `low` – mniej niż
 * 1 GB albo niż trzy ostatnie kopie: kolejna kopia, baza lub logi mogą się nie zmieścić.
 * Free space on the disk holding local backups; `low` below 1 GB or three times the last backup.
 */
export async function diskSpace(dir: string, lastBackup = 0): Promise<{ free: number; total: number; low: boolean } | null> {
	let d = resolve(dir);
	for (;;) {
		try {
			const s = await statfs(d);
			const free = s.bavail * s.bsize;
			return { free, total: s.blocks * s.bsize, low: free < Math.max(GB, 3 * lastBackup) };
		} catch {
			const up = dirname(d);
			if (up === d) return null;
			d = up;
		}
	}
}

/**
 * Pobranie świeżej kopii (`/admin/backup`) tylko z tej samej strony: każde żądanie buduje pełne archiwum,
 * więc obca strona z `<img src=".../admin/backup">` (w tailnecie logowanie dzieje się „w tle”) mogłaby
 * zajmować dysk i procesor. Przeglądarki podają `Sec-Fetch-Site`: z linku w panelu `same-origin`, z paska
 * adresu `none`, z obcej strony `cross-site`/`same-site`. Bez nagłówka (skrypty) – tylko z `Origin` aplikacji.
 */
export function sameOriginRequest(headers: Headers, origin: string): boolean {
	const site = headers.get('sec-fetch-site');
	if (site) return site === 'same-origin' || site === 'none';
	return headers.get('origin') === origin;
}

/**
 * W trakcie przywracania baza jest podmieniana (zapis z kopii trzyma blokadę kilka sekund) – zapisy i odczyty
 * dostałyby SQLITE_BUSY. Żądania dostają wtedy 503 z komunikatem; strona błędu kiosku sama ponawia co 5 s.
 * Wyjątek: `/healthz` (kontener nie jest „chory” w trakcie przywracania).
 */
export const blockedByRestore = (path: string) => busy === 'restore' && path !== '/healthz';

async function tmpFile(db: DB, name: string) {
	const dir = join(workDir(db), 'backup');
	await mkdir(dir, { recursive: true });
	return join(dir, `${randomBytes(6).toString('hex')}-${name}`);
}

async function copyInto(dir: string, name: string, src: string) {
	await mkdir(dir, { recursive: true });
	const part = join(dir, `.${name}.part`);
	await pipeline(createReadStream(src), createWriteStream(part));
	await rename(part, join(dir, name));
}

async function rotateLocal(dir: string, keep: number) {
	const names = await readdir(dir).catch(() => [] as string[]);
	await Promise.all(toRotate(names, keep).map((n) => rm(join(dir, n), { force: true })));
}

async function rotateRemote(dav: Webdav, keep: number) {
	const names = (await dav.list()).map((x) => x.name);
	for (const n of toRotate(names, keep)) await dav.remove(n);
}

export interface RunResult {
	file: string;
	size: number;
	targets: { id: string; label: string; ok: boolean; error?: string }[];
}

/**
 * Robi kopię i wysyła ją do wszystkich włączonych miejsc. `passphrase` – hasło jednorazowe
 * (nie zapisywane); bez niego używane jest zapisane hasło, jeśli jest.
 */
export async function runBackup(
	db: DB,
	opts: { reason?: 'auto' | 'manual'; passphrase?: string | null; now?: Date; fetch?: typeof fetch; slot?: string | null } = {}
): Promise<RunResult> {
	return exclusive('backup', async () => {
		const now = opts.now ?? new Date();
		const cfg = getConfig(db);
		const targets = cfg.targets.filter((x) => x.enabled);
		if (!targets.length) throw new InputError(t('p4.backup.err.noTargets'));
		const passphrase = opts.passphrase || storedPassphrase(db);
		const name = archiveName(now, !!passphrase);
		const tmp = await tmpFile(db, name);
		const result: RunResult = { file: name, size: 0, targets: [] };
		const state = getState(db);
		try {
			result.size = (await createArchive(db, tmp, { passphrase, now })).size;
			for (const tg of targets) {
				try {
					if (tg.kind === 'local') {
						await copyInto(targetDir(tg), name, tmp);
						await rotateLocal(targetDir(tg), tg.keep);
					} else {
						const dav = webdavFor(db, tg, opts.fetch);
						await dav.ensureFolder();
						await dav.upload(name, tmp);
						await rotateRemote(dav, tg.keep);
					}
					state.targets[tg.id] = { at: now.toISOString(), ok: true, file: name, size: result.size };
					result.targets.push({ id: tg.id, label: targetLabel(tg), ok: true });
				} catch (e) {
					const error = errText(e);
					console.error(`[kopia] ${targetLabel(tg)}: ${error}`);
					state.targets[tg.id] = { ...state.targets[tg.id], at: now.toISOString(), ok: false, error };
					result.targets.push({ id: tg.id, label: targetLabel(tg), ok: false, error });
				}
			}
		} catch (e) {
			const error = errText(e);
			for (const tg of targets) state.targets[tg.id] = { ...state.targets[tg.id], at: now.toISOString(), ok: false, error };
			saveState(db, { ...state, lastRun: { at: now.toISOString(), ok: false, reason: opts.reason ?? 'manual' } });
			throw new InputError(t('p4.backup.err.create', { error }));
		} finally {
			await rm(tmp, { force: true });
		}
		const ok = result.targets.every((x) => x.ok);
		saveState(db, {
			...state,
			lastSlot: opts.slot !== undefined ? opts.slot : state.lastSlot,
			lastRun: { at: now.toISOString(), ok, reason: opts.reason ?? 'manual' }
		});
		return result;
	});
}

/** Archiwum do pobrania z panelu (plik tymczasowy – wywołujący go usuwa). */
export async function archiveForDownload(db: DB, now = new Date()) {
	const passphrase = storedPassphrase(db);
	const name = archiveName(now, !!passphrase);
	const file = await tmpFile(db, name);
	await createArchive(db, file, { passphrase, now });
	return { file, name };
}

/** Kopia „przed przywróceniem” w domyślnym folderze lokalnym (trzymamy 3 ostatnie). */
export async function preRestoreBackup(db: DB, now = new Date()) {
	const passphrase = storedPassphrase(db);
	const dir = localBackupDir();
	await mkdir(dir, { recursive: true });
	const name = archiveName(now, !!passphrase, 'kalendarz-przed-przywroceniem-');
	const tmp = await tmpFile(db, name);
	try {
		await createArchive(db, tmp, { passphrase, now });
		await copyInto(dir, name, tmp);
	} finally {
		await rm(tmp, { force: true });
	}
	await rotateLocal(dir, Number.MAX_SAFE_INTEGER);
	return join(dir, name);
}

/** Co minutę: gdy minął termin z harmonogramu, a ten termin jeszcze nie był obsłużony – kopia. */
export function startBackups(db: DB, dir: string): () => void {
	defaultDir = dir;
	// Pozostałości po przerwanej kopii albo przywracaniu (restart w trakcie) – przed pierwszą kopią.
	const cleaned = rm(workDir(db), { recursive: true, force: true }).catch(() => {});
	const tick = async () => {
		await cleaned;
		if (busy) return;
		const now = new Date();
		let slot: string | null;
		try {
			slot = dueSlot(getConfig(db), now);
			if (!slot || getState(db).lastSlot === slot) return;
		} catch (e) {
			return void console.error('[kopia] harmonogram:', e);
		}
		try {
			const r = await runBackup(db, { reason: 'auto', now, slot });
			const bad = r.targets.filter((x) => !x.ok);
			if (bad.length) console.error(`[kopia] nie wyszła do: ${bad.map((x) => `${x.label} (${x.error})`).join(', ')}`);
		} catch (e) {
			console.error('[kopia] nie wyszła:', e);
			// Termin uznany za obsłużony – kolejna próba w następnym terminie albo ręcznie z panelu.
			try {
				saveState(db, { ...getState(db), lastSlot: slot });
			} catch {
				/* baza w trakcie przywracania */
			}
		}
	};
	const timer = setInterval(tick, 60_000);
	void tick();
	return () => clearInterval(timer);
}
