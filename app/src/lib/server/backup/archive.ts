import Database from 'better-sqlite3';
import { createReadStream, readFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import type { DB } from '../db/index.js';
import { FILE, MAX_BYTES, MEDIA_KINDS, mediaRoot, type MediaKind } from '../media.js';
import { InputError } from '../store.js';
import { readTar, tarStream, type TarEntry } from './tar.js';
import { decryptFile, encryptor, isEncrypted } from './crypt.js';
import { t } from '#lib/i18n/index.js';
import pkg from '../../../../package.json' with { type: 'json' };

/**
 * Archiwum kopii (`.tar.gz`, zaszyfrowane: `.tar.gz.enc`):
 *   manifest.json     – format, wersja aplikacji, ostatnia migracja bazy, data utworzenia
 *   kalendarz.db      – spójna migawka SQLite (backup API, także w trakcie zapisów)
 *   media/photos/…    – zdjęcia wygaszacza
 *   media/avatars/…   – zdjęcia domowników
 *
 * Backup archive layout. Extraction accepts only these names (no paths from the archive reach the
 * file system unchecked) and caps every file at its known maximum size.
 */

export const FORMAT = 'wulf-kalendarz-backup';
export const FORMAT_VERSION = 1;
export const APP_VERSION: string = pkg.version;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');
const MAX_DB = 4 * 1024 ** 3;
const MAX_MANIFEST = 64 * 1024;
/** Górna granica liczby zdjęć w archiwum (panel pozwala na MAX_PHOTOS zdjęć + awatary). */
const MAX_MEDIA_FILES = 2000;

export interface Schema {
	/** Nazwa ostatniej migracji (np. `0008_care_meds_ha`), gdy znana. */
	tag: string | null;
	/** `when` ostatniej migracji z dziennika Drizzle – porównywane między kopią a aplikacją. */
	createdAt: number;
}

export interface Manifest {
	format: typeof FORMAT;
	version: number;
	app: string;
	createdAt: string;
	schema: Schema;
	media: Record<MediaKind, number>;
}

const migrationsFolder = () => resolve(process.env.MIGRATIONS_PATH ?? 'drizzle');

/** Migracje znane tej wersji aplikacji (dziennik Drizzle). */
export function appMigrations(): { tag: string; when: number }[] {
	const j = JSON.parse(readFileSync(join(migrationsFolder(), 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string; when: number }[] };
	return j.entries.map(({ tag, when }) => ({ tag, when }));
}

export function appSchema(): Schema {
	const last = appMigrations().at(-1);
	return { tag: last?.tag ?? null, createdAt: last?.when ?? 0 };
}

/** Ostatnia migracja zapisana w bazie (tabela Drizzle `__drizzle_migrations`). */
export function dbSchema(sqlite: Database.Database): Schema {
	let createdAt = 0;
	try {
		const row = sqlite.prepare('SELECT max(created_at) AS m FROM __drizzle_migrations').get() as { m: number | null };
		createdAt = Number(row.m ?? 0);
	} catch {
		createdAt = 0;
	}
	return { tag: appMigrations().find((m) => m.when === createdAt)?.tag ?? null, createdAt };
}

async function mediaFiles(root = mediaRoot()) {
	const out: { kind: MediaKind; file: string; path: string; size: number; mtime: Date }[] = [];
	for (const kind of MEDIA_KINDS) {
		const names = await readdir(join(root, kind)).catch(() => [] as string[]);
		for (const file of names.filter((f) => FILE.test(f)).sort()) {
			const path = join(root, kind, file);
			const s = await stat(path).catch(() => null);
			if (s?.isFile()) out.push({ kind, file, path, size: s.size, mtime: s.mtime });
		}
	}
	return out;
}

/**
 * Tworzy archiwum `out`: migawka bazy (obok `out`, potem usuwana), zdjęcia, manifest.
 * Z hasłem – zaszyfrowane. Zwraca rozmiar i manifest.
 */
export async function createArchive(db: DB, out: string, opts: { passphrase?: string | null; mediaDir?: string; now?: Date } = {}) {
	const snap = `${out}.db-snapshot`;
	await rm(snap, { force: true });
	await db.$client.backup(snap);
	try {
		const media = await mediaFiles(opts.mediaDir);
		const manifest: Manifest = {
			format: FORMAT,
			version: FORMAT_VERSION,
			app: APP_VERSION,
			createdAt: (opts.now ?? new Date()).toISOString(),
			schema: dbSchema(db.$client),
			media: { photos: media.filter((m) => m.kind === 'photos').length, avatars: media.filter((m) => m.kind === 'avatars').length }
		};
		const json = Buffer.from(JSON.stringify(manifest, null, 2));
		const dbSize = (await stat(snap)).size;
		const entries: TarEntry[] = [
			{ name: 'manifest.json', size: json.length, body: json },
			{ name: 'kalendarz.db', size: dbSize, body: createReadStream(snap) },
			...media.map((m) => ({ name: `media/${m.kind}/${m.file}`, size: m.size, mtime: m.mtime, body: createReadStream(m.path) }))
		];
		const steps: unknown[] = [tarStream(entries), createGzip({ level: 6 })];
		if (opts.passphrase) steps.push(await encryptor(opts.passphrase));
		steps.push(createWriteStream(out));
		await (pipeline as (...s: unknown[]) => Promise<void>)(...steps);
		return { size: (await stat(out)).size, manifest };
	} finally {
		await rm(snap, { force: true });
	}
}

/** Sprawdza manifest: nasz format, znana wersja formatu, sensowne pola. */
export function parseManifest(raw: unknown): Manifest {
	const m = raw as Partial<Manifest> | null;
	if (!m || typeof m !== 'object' || m.format !== FORMAT) throw new InputError(t('p4.backup.err.notBackup'));
	if (typeof m.version !== 'number' || m.version > FORMAT_VERSION) throw new InputError(t('p4.backup.err.formatNewer'));
	if (typeof m.createdAt !== 'string' || Number.isNaN(Date.parse(m.createdAt))) throw new InputError(t('p4.backup.err.manifest'));
	if (!m.schema || typeof m.schema.createdAt !== 'number') throw new InputError(t('p4.backup.err.manifest'));
	const media = { photos: Number(m.media?.photos ?? 0), avatars: Number(m.media?.avatars ?? 0) };
	return { format: FORMAT, version: m.version, app: String(m.app ?? '?'), createdAt: m.createdAt, schema: { tag: m.schema.tag ?? null, createdAt: m.schema.createdAt }, media };
}

export type ArchiveKind = 'archive' | 'encrypted' | 'sqlite' | 'unknown';

/** Rodzaj pliku po pierwszych bajtach: nasze archiwum, zaszyfrowane, sama baza (stare kopie `.db`). */
export async function sniffArchive(file: string): Promise<ArchiveKind> {
	if (await isEncrypted(file)) return 'encrypted';
	const fh = await open(file, 'r');
	try {
		const b = Buffer.alloc(16);
		const { bytesRead } = await fh.read(b, 0, 16, 0);
		if (bytesRead >= 2 && b[0] === 0x1f && b[1] === 0x8b) return 'archive';
		if (bytesRead === 16 && b.equals(SQLITE_MAGIC)) return 'sqlite';
		return 'unknown';
	} finally {
		await fh.close();
	}
}

export interface Extracted {
	/** null = stara kopia samej bazy (`kalendarz-RRRR-MM-DD.db`) – zdjęcia zostają bez zmian */
	manifest: Manifest | null;
	dbFile: string;
	/** katalog z `photos/` i `avatars/` – tylko z archiwum */
	mediaDir: string | null;
	encrypted: boolean;
}

/**
 * Rozpakowuje kopię do pustego katalogu `dir`. Przyjmuje nasze archiwum (także zaszyfrowane)
 * albo sam plik bazy SQLite (stare kopie nocne). Nie sprawdza jeszcze bazy – to robi `inspectDb`.
 */
export async function extractArchive(file: string, dir: string, opts: { passphrase?: string | null } = {}): Promise<Extracted> {
	const kind = await sniffArchive(file);
	await mkdir(dir, { recursive: true });
	const dbFile = join(dir, 'kalendarz.db');
	if (kind === 'sqlite') {
		await pipeline(createReadStream(file), createWriteStream(dbFile));
		return { manifest: null, dbFile, mediaDir: null, encrypted: false };
	}
	if (kind === 'unknown') throw new InputError(t('p4.backup.err.notBackup'));
	const encrypted = kind === 'encrypted';
	if (encrypted && !opts.passphrase) throw new InputError(t('p4.backup.err.needPassphrase'));

	const got: { manifest: Manifest | null; db: boolean; media: number } = { manifest: null, db: false, media: 0 };
	const mediaDir = join(dir, 'media');
	try {
		const source = encrypted ? await decryptFile(file, opts.passphrase!) : createReadStream(file);
		await pipeline(source as AsyncIterable<Buffer>, createGunzip(), (tar: AsyncIterable<Buffer>) => readTar(tar, async ({ name, size }) => {
			let path: string;
			let max: number;
			if (name === 'manifest.json') [path, max] = [join(dir, 'manifest.json'), MAX_MANIFEST];
			else if (name === 'kalendarz.db') [path, max, got.db] = [dbFile, MAX_DB, true];
			else {
				const m = name.match(/^media\/(photos|avatars)\/([^/]+)$/);
				if (!m || !FILE.test(m[2])) throw new InputError(t('p4.backup.err.unexpected', { name: name.slice(0, 120) }));
				if (++got.media > MAX_MEDIA_FILES) throw new InputError(t('p4.backup.err.tooBig', { name: 'media/' }));
				await mkdir(join(mediaDir, m[1]), { recursive: true });
				[path, max] = [join(mediaDir, m[1], m[2]), MAX_BYTES[m[1] as MediaKind]];
			}
			if (size > max) throw new InputError(t('p4.backup.err.tooBig', { name }));
			if (name !== 'manifest.json' && !got.manifest) throw new InputError(t('p4.backup.err.manifest'));
			const fh = await open(path, 'wx');
			const chunks: Buffer[] = [];
			return {
				write: async (c) => {
					if (name === 'manifest.json') chunks.push(c);
					await fh.write(c);
				},
				close: async () => {
					await fh.close();
					if (name === 'manifest.json') {
						let raw: unknown;
						try {
							raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
						} catch {
							throw new InputError(t('p4.backup.err.manifest'));
						}
						got.manifest = parseManifest(raw);
					}
				}
			};
		}));
	} catch (e) {
		if (e instanceof InputError) throw e;
		// Złe hasło psuje dane już przed sprawdzeniem znacznika GCM (gunzip/tar rzucą wcześniej).
		if (encrypted) throw new InputError(t('p4.backup.err.passphrase'));
		throw new InputError(t('p4.backup.err.damaged', { error: e instanceof Error ? e.message : String(e) }));
	}
	if (!got.manifest) throw new InputError(t('p4.backup.err.manifest'));
	if (!got.db) throw new InputError(t('p4.backup.err.noDb'));
	return { manifest: got.manifest, dbFile, mediaDir, encrypted };
}

export interface DbInfo {
	schema: Schema;
	/** migracje aplikacji, których brakuje w kopii (uruchomią się przy przywracaniu) */
	pending: number;
	counts: Record<string, number>;
}

const COUNTED = ['members', 'local_events', 'chores', 'local_shopping', 'local_notes', 'recipes'] as const;

/**
 * Sprawdza bazę z kopii w pliku tymczasowym: `integrity_check`, schemat nie nowszy niż aplikacja,
 * liczba wierszy kilku tabel do podsumowania. Kopii z nowszej wersji nie przyjmujemy.
 */
export function inspectDb(file: string): DbInfo {
	let sqlite: Database.Database;
	try {
		sqlite = new Database(file, { fileMustExist: true });
	} catch {
		throw new InputError(t('p4.backup.err.integrity', { error: 'open' }));
	}
	try {
		let check: string;
		try {
			check = (sqlite.pragma('integrity_check') as { integrity_check: string }[]).map((r) => r.integrity_check).join('; ');
		} catch (e) {
			throw new InputError(t('p4.backup.err.integrity', { error: e instanceof Error ? e.message : String(e) }));
		}
		if (check !== 'ok') throw new InputError(t('p4.backup.err.integrity', { error: check.slice(0, 200) }));
		const schema = dbSchema(sqlite);
		const app = appSchema();
		if (!schema.createdAt) throw new InputError(t('p4.backup.err.notBackup'));
		if (schema.createdAt > app.createdAt) throw new InputError(t('p4.backup.err.newer'));
		const counts: Record<string, number> = {};
		for (const table of COUNTED) {
			try {
				counts[table] = (sqlite.prepare(`SELECT count(*) AS c FROM "${table}"`).get() as { c: number }).c;
			} catch {
				counts[table] = 0;
			}
		}
		return { schema, pending: appMigrations().filter((m) => m.when > schema.createdAt).length, counts };
	} finally {
		sqlite.close();
	}
}
