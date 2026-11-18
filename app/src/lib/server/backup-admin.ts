import { fail } from '@sveltejs/kit';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { act } from './act.js';
import { getDb } from './db/index.js';
import { InputError } from './store.js';
import * as B from './backup.js';
import * as R from './backup/restore.js';
import { t } from '#lib/i18n/index.js';

/** Sekcja panelu „Kopie zapasowe” (`/admin/kopie`): harmonogram, miejsca, szyfrowanie, przywracanie. */

const LOCAL_LIST = 30;

export const backups = {
	slug: 'kopie',
	get label() {
		return t('p4.backup.title');
	},
	load: async (db: Parameters<typeof B.getConfig>[0]) => {
		const cfg = B.getConfig(db);
		const state = B.getState(db);
		const targets = await Promise.all(
			cfg.targets.map(async (tg) => ({
				id: tg.id,
				kind: tg.kind,
				name: tg.name,
				label: B.targetLabel(tg),
				path: tg.path,
				dir: tg.kind === 'local' ? B.targetDir(tg) : null,
				url: tg.url,
				user: tg.user,
				keep: tg.keep,
				enabled: tg.enabled,
				// Hasło WebDAV nigdy nie wychodzi z serwera – tylko informacja, że jest zapisane.
				hasPassword: tg.kind === 'webdav' && B.hasDavPassword(db, tg.id),
				status: state.targets[tg.id] ?? null,
				files: tg.kind === 'local' ? (await B.listLocal(B.targetDir(tg))).slice(0, LOCAL_LIST) : null
			}))
		);
		return {
			backup: {
				freq: cfg.freq,
				weekday: cfg.weekday,
				time: cfg.time,
				targets,
				lastRun: state.lastRun,
				encrypted: B.hasPassphrase(db),
				defaultDir: B.localBackupDir(),
				busy: B.isBusy(),
				pending: R.pendingRestore(),
				maxTargets: B.MAX_TARGETS,
				// Wolne miejsce przy domyślnym folderze kopii (tam też baza i zdjęcia).
				disk: await B.diskSpace(B.localBackupDir(), Math.max(0, ...Object.values(state.targets).map((s) => s?.size ?? 0)))
			}
		};
	},
	actions: {
		backupNow: act(async (f, db) => {
			const r = await B.runBackup(db, { reason: 'manual', passphrase: String(f.get('passphrase') ?? '') || null });
			const bad = r.targets.filter((x) => !x.ok);
			if (bad.length) throw new InputError(t('p4.backup.err.partial', { list: bad.map((x) => `${x.label}: ${x.error}`).join('; ') }));
		}, 'backupRun'),
		backupSchedule: act((f, db) => B.saveSchedule(db, f), 'backupSchedule'),
		backupSaveTarget: act((f, db) => B.saveTarget(db, f), 'backupTarget'),
		backupDeleteTarget: act((f, db) => B.deleteTarget(db, f), 'backupTarget'),
		backupTestTarget: act((f, db) => B.testTarget(db, String(f.get('id') ?? '')), 'backupTarget'),
		backupPassphrase: act((f, db) => B.savePassphrase(db, f), 'backupCrypt'),
		backupClearPassphrase: act((_, db) => B.clearPassphrase(db), 'backupCrypt'),
		/** Lista kopii w miejscu WebDAV (na żądanie – nie przy każdym otwarciu strony). */
		backupList: async ({ request }: { request: Request }) => {
			const f = await request.formData();
			const target = String(f.get('id') ?? '');
			try {
				return { section: 'backupList', ok: true, target, files: await B.listTarget(getDb(), target) };
			} catch (e) {
				return fail(400, { section: 'backupList', target, error: e instanceof Error ? e.message : String(e) });
			}
		},
		backupPrepare: act(async (f, db) => {
			const passphrase = String(f.get('passphrase') ?? '') || null;
			const upload = String(f.get('upload') ?? '');
			if (upload) {
				const file = R.uploadedFile(db, upload);
				try {
					await R.prepareRestore(db, file, { source: String(f.get('filename') ?? '').slice(0, 120) || 'upload', passphrase });
				} finally {
					await rm(file, { force: true });
				}
			} else
				await R.prepareFromTarget(db, String(f.get('target') ?? ''), String(f.get('name') ?? ''), passphrase).catch((e) => {
					// brak pliku, błąd WebDAV – komunikat przy formularzu, nie strona błędu
					throw e instanceof InputError ? e : new InputError(e instanceof Error ? e.message : String(e));
				});
		}, 'backupRestore'),
		backupCancel: act(() => R.cancelRestore(), 'backupRestore'),
		backupConfirm: async ({ request }: { request: Request }) => {
			const f = await request.formData();
			try {
				const before = await R.confirmRestore(getDb(), String(f.get('id') ?? ''));
				return { section: 'backupRestore', ok: true, restored: true, before: basename(before) };
			} catch (e) {
				if (e instanceof InputError) return fail(400, { section: 'backupRestore', error: e.message });
				return fail(500, { section: 'backupRestore', error: t('p4.backup.err.restore', { error: e instanceof Error ? e.message : String(e) }) });
			}
		}
	}
};
