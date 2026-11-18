import { appFetch } from '../net.js';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DB } from '../db/index.js';
import { openDb } from '../db/index.js';
import { mediaRoot } from '../media.js';
import { InputError } from '../store.js';
import { applyRegion, activeSources, getSetting, pauseSync, refreshNow } from '../sync.js';
import { modulesSetting, saveModules } from '#lib/modules/registry.server.js';
import { setLang, t } from '#lib/i18n/index.js';
import { workDir, exclusive, exportBackupSettings, fetchFromTarget, importBackupSettings, preRestoreBackup, storedPassphrase } from '../backup.js';
import { appSchema, extractArchive, inspectDb, type DbInfo, type Extracted } from './archive.js';

/**
 * Przywracanie kopii w dwóch krokach:
 *  1. `prepareRestore` – plik (wgrany albo z listy) rozpakowany do katalogu tymczasowego obok bazy,
 *     sprawdzony (manifest, `integrity_check`, schemat nie nowszy niż aplikacja). Panel pokazuje,
 *     co zostanie zastąpione.
 *  2. `confirmRestore` – kopia „przed przywróceniem”, wstrzymanie synchronizacji, migracje na kopii
 *     tymczasowej, podmiana bazy jedną transakcją (SQLite backup API do pliku bazy), podmiana zdjęć,
 *     ustawienia kopii zostają te sprzed przywrócenia, wznowienie synchronizacji.
 *
 * Restore: stage + validate first, then swap. The live connection stays open – the SQLite backup API
 * writes the migrated snapshot into the live database file in one locked step, so every reader sees
 * either the old or the new database. Backup settings (targets, passwords) survive the restore.
 */

export interface PendingRestore {
	id: string;
	source: string;
	createdAt: string | null;
	app: string | null;
	encrypted: boolean;
	legacy: boolean;
	media: { photos: number; avatars: number } | null;
	info: DbInfo;
	appSchema: string | null;
	size: number;
}

let pending: (PendingRestore & { dir: string; extracted: Extracted }) | null = null;

const restoreRoot = (db: DB) => join(workDir(db), 'restore');
const UPLOAD_ID = /^[a-f0-9]{32}$/;
export const MAX_UPLOAD = 4 * 1024 ** 3;

/** Co panel pokazuje przed potwierdzeniem (bez ścieżek na serwerze). */
export function pendingRestore(): PendingRestore | null {
	if (!pending) return null;
	const { dir: _d, extracted: _e, ...rest } = pending;
	return rest;
}

export async function cancelRestore() {
	if (pending) await rm(pending.dir, { recursive: true, force: true });
	pending = null;
}

/** Sprząta po przerwanym przywracaniu (start serwera). */
export async function cleanRestoreDir(db: DB) {
	pending = null;
	await rm(restoreRoot(db), { recursive: true, force: true }).catch(() => {});
}

/** Kawałek wgrywanego pliku (panel dzieli plik na części mieszczące się w limicie żądania). */
export async function saveUploadChunk(db: DB, id: string, offset: number, data: Uint8Array) {
	if (!UPLOAD_ID.test(id) || !Number.isSafeInteger(offset) || offset < 0) throw new InputError(t('p4.backup.err.upload'));
	if (offset + data.length > MAX_UPLOAD) throw new InputError(t('p4.backup.err.tooBig', { name: 'upload' }));
	const dir = join(restoreRoot(db), 'uploads');
	await mkdir(dir, { recursive: true });
	const file = join(dir, id);
	const size = await stat(file).then((s) => s.size, () => 0);
	if (offset !== size && !(offset === 0 && size > 0)) throw new InputError(t('p4.backup.err.upload'));
	const fh = await open(file, offset === 0 ? 'w' : 'a');
	try {
		await fh.write(data);
	} finally {
		await fh.close();
	}
	return offset + data.length;
}

export const uploadedFile = (db: DB, id: string) => {
	if (!UPLOAD_ID.test(id)) throw new InputError(t('p4.backup.err.upload'));
	return join(restoreRoot(db), 'uploads', id);
};

/** Krok 1: rozpakuj i sprawdź. `file` zostaje nietknięty (wywołujący usuwa wgrany plik). */
export async function prepareRestore(db: DB, file: string, opts: { source: string; passphrase?: string | null }): Promise<PendingRestore> {
	await cancelRestore();
	const id = randomBytes(8).toString('hex');
	const dir = join(restoreRoot(db), id);
	try {
		const size = (await stat(file)).size;
		const extracted = await extractArchive(file, join(dir, 'x'), { passphrase: opts.passphrase || storedPassphrase(db) });
		const info = inspectDb(extracted.dbFile);
		const m = extracted.manifest;
		pending = {
			id,
			dir,
			extracted,
			source: opts.source,
			createdAt: m?.createdAt ?? null,
			app: m?.app ?? null,
			encrypted: extracted.encrypted,
			legacy: !m,
			media: m ? m.media : null,
			info,
			appSchema: appSchema().tag,
			size
		};
		return pendingRestore()!;
	} catch (e) {
		await rm(dir, { recursive: true, force: true });
		throw e;
	}
}

/** Krok 1 dla pliku z miejsca kopii (lokalnego albo WebDAV). */
export async function prepareFromTarget(db: DB, targetId: string, name: string, passphrase?: string | null, f: typeof fetch = appFetch) {
	const dir = join(restoreRoot(db), 'uploads');
	await mkdir(dir, { recursive: true });
	const tmp = join(dir, randomBytes(16).toString('hex'));
	try {
		await fetchFromTarget(db, targetId, name, tmp, f);
		return await prepareRestore(db, tmp, { source: name, passphrase });
	} finally {
		await rm(tmp, { force: true });
	}
}

/** Zastępuje katalog zdjęć: stary odsuwamy, nowy wsuwamy, stary usuwamy (kopia „przed” go ma). */
async function swapMedia(from: string) {
	const root = resolve(mediaRoot());
	const old = `${root}.old-${Date.now().toString(36)}`;
	await mkdir(from, { recursive: true });
	const had = await stat(root).then(() => true, () => false);
	if (had) await rename(root, old);
	try {
		await rename(from, root);
	} catch {
		// inny system plików (np. MEDIA_DIR na osobnym wolumenie) – kopiujemy
		await cp(from, root, { recursive: true });
	}
	if (had) await rm(old, { recursive: true, force: true });
}

/** Krok 2: przywrócenie. Zwraca ścieżkę kopii „przed przywróceniem”. */
export async function confirmRestore(db: DB, id: string, now = new Date()) {
	const p = pending;
	if (!p || p.id !== id) throw new InputError(t('p4.backup.err.noPending'));
	return exclusive('restore', async () => {
		pauseSync(true);
		try {
			const before = await preRestoreBackup(db, now);
			const keep = exportBackupSettings(db);
			// Migracje na kopii tymczasowej – gdy się nie udadzą, działająca baza jest nietknięta.
			const staged = openDb(p.extracted.dbFile);
			try {
				staged.$client.pragma('wal_checkpoint(TRUNCATE)');
				await staged.$client.backup(db.$client.name);
			} finally {
				staged.$client.close();
			}
			importBackupSettings(db, keep);
			if (p.extracted.mediaDir) await swapMedia(p.extracted.mediaDir);
			applyRegion(db);
			setLang(getSetting(db, 'language'));
			// Zapis modułów: zasiew nowo aktywnych i ich źródła do pętli synchronizacji.
			saveModules(db, modulesSetting(db));
			return before;
		} finally {
			pauseSync(false);
			pending = null;
			await rm(p.dir, { recursive: true, force: true });
			for (const s of activeSources(db)) void refreshNow(db, s.name);
		}
	});
}
