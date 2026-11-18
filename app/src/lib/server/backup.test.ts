import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from './db/index';
import { members } from './db/schema';
import * as B from './backup';
import { appMigrations, appSchema, createArchive, extractArchive, inspectDb, parseManifest, FORMAT } from './backup/archive';
import { readTar, tarStream } from './backup/tar';
import { Webdav, parseMultistatus } from './backup/webdav';
import { cancelRestore, confirmRestore, pendingRestore, prepareFromTarget, prepareRestore, saveUploadChunk, uploadedFile } from './backup/restore';
import { getKv } from './kv';
import { startWebdav, USER, PASSWORD } from '../../../e2e/webdav-mock.mjs';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

/** Świeży katalog danych: baza w pliku, zdjęcia obok, zmienne środowiska jak w aplikacji. */
async function instance() {
	const dir = await mkdtemp(join(tmpdir(), 'kal-bak-'));
	process.env.DATABASE_PATH = join(dir, 'kalendarz.db');
	process.env.MEDIA_DIR = join(dir, 'media');
	const db = openDb(process.env.DATABASE_PATH);
	return { dir, db };
}

async function addMedia(dir: string) {
	await mkdir(join(dir, 'media', 'photos'), { recursive: true });
	await mkdir(join(dir, 'media', 'avatars'), { recursive: true });
	await writeFile(join(dir, 'media', 'photos', 'lato-abc.jpg'), JPG);
	await writeFile(join(dir, 'media', 'avatars', 'ola-x1.png'), PNG);
}

const addMember = (db: DB, id: string, name: string) => db.insert(members).values({ id, name, color: '#123456', sortOrder: 0 } as never).run();

afterAll(() => {
	delete process.env.MEDIA_DIR;
	delete process.env.DATABASE_PATH;
});

describe('tar', () => {
	it('zapis i odczyt: nagłówki, wypełnienie, puste pliki', async () => {
		const big = Buffer.alloc(1300, 7);
		const chunks: Buffer[] = [];
		for await (const c of tarStream([
			{ name: 'a.txt', size: 3, body: Buffer.from('abc') },
			{ name: 'empty', size: 0, body: Buffer.alloc(0) },
			{ name: 'media/photos/x.jpg', size: big.length, body: (async function* () { yield big.subarray(0, 700); yield big.subarray(700); })() }
		]))
			chunks.push(c);
		const tar = Buffer.concat(chunks);
		expect(tar.length % 512).toBe(0);
		const got: Record<string, Buffer> = {};
		await readTar(
			(async function* () {
				for (let i = 0; i < tar.length; i += 333) yield tar.subarray(i, i + 333);
			})(),
			async ({ name }) => {
				const parts: Buffer[] = [];
				return { write: async (c) => void parts.push(c), close: async () => void (got[name] = Buffer.concat(parts)) };
			}
		);
		expect(Object.keys(got)).toEqual(['a.txt', 'empty', 'media/photos/x.jpg']);
		expect(got['a.txt'].toString()).toBe('abc');
		expect(got['media/photos/x.jpg'].equals(big)).toBe(true);
	});

	it('plik, który zmienił rozmiar w trakcie, przerywa kopię', async () => {
		const run = async () => {
			for await (const _ of tarStream([{ name: 'a', size: 5, body: Buffer.from('abc') }]));
		};
		await expect(run()).rejects.toThrow(/rozmiar/);
	});
});

describe('archiwum', () => {
	let ctx: Awaited<ReturnType<typeof instance>>;
	beforeEach(async () => {
		ctx = await instance();
		await addMedia(ctx.dir);
		addMember(ctx.db, 'ola', 'Ola');
	});

	it('baza + zdjęcia + manifest: tam i z powrotem', async () => {
		const out = join(ctx.dir, 'k.tar.gz');
		const { manifest, size } = await createArchive(ctx.db, out);
		expect(size).toBeGreaterThan(100);
		expect(manifest).toMatchObject({ format: FORMAT, version: 1, media: { photos: 1, avatars: 1 }, schema: appSchema() });
		const x = await extractArchive(out, join(ctx.dir, 'x'));
		expect(x.encrypted).toBe(false);
		expect(x.manifest).toEqual(manifest);
		expect((await readFile(join(x.mediaDir!, 'photos', 'lato-abc.jpg'))).equals(JPG)).toBe(true);
		expect((await readFile(join(x.mediaDir!, 'avatars', 'ola-x1.png'))).equals(PNG)).toBe(true);
		const info = inspectDb(x.dbFile);
		expect(info.pending).toBe(0);
		expect(info.counts.members).toBe(1);
		// migawka nie zostawia plików pośrednich
		expect((await readdir(ctx.dir)).filter((f) => f.includes('snapshot'))).toEqual([]);
	});

	it('szyfrowanie: dobre hasło, złe hasło, brak hasła', async () => {
		const out = join(ctx.dir, 'k.tar.gz.enc');
		await createArchive(ctx.db, out, { passphrase: 'tajne-haslo-1' });
		expect((await readFile(out)).subarray(0, 8).toString()).toBe('WKBAKENC');
		await expect(extractArchive(out, join(ctx.dir, 'x1'))).rejects.toThrow(/zaszyfrowana/);
		await expect(extractArchive(out, join(ctx.dir, 'x2'), { passphrase: 'zle-haslo-123' })).rejects.toThrow(/Złe hasło/);
		const x = await extractArchive(out, join(ctx.dir, 'x3'), { passphrase: 'tajne-haslo-1' });
		expect(x.encrypted).toBe(true);
		expect(inspectDb(x.dbFile).counts.members).toBe(1);
	});

	it('zmieniony bajt w zaszyfrowanej kopii jest wykryty', async () => {
		const out = join(ctx.dir, 'k.enc');
		await createArchive(ctx.db, out, { passphrase: 'tajne-haslo-1' });
		const buf = await readFile(out);
		buf[buf.length - 40] ^= 1;
		await writeFile(out, buf);
		await expect(extractArchive(out, join(ctx.dir, 'x'), { passphrase: 'tajne-haslo-1' })).rejects.toThrow(/Złe hasło albo uszkodzona/);
	});

	it('manifest: zły format, nowsza wersja formatu, brak pól', () => {
		const ok = { format: FORMAT, version: 1, app: '1', createdAt: '2026-11-12T10:00:00Z', schema: { tag: 'x', createdAt: 1 }, media: { photos: 0, avatars: 0 } };
		expect(parseManifest(ok).schema.createdAt).toBe(1);
		expect(() => parseManifest({ ...ok, format: 'inne' })).toThrow(/nie jest plik/);
		expect(() => parseManifest({ ...ok, version: 2 })).toThrow(/nowszej wersji/);
		expect(() => parseManifest({ ...ok, createdAt: 'wczoraj' })).toThrow(/manifest/);
		expect(() => parseManifest({ ...ok, schema: null })).toThrow(/manifest/);
	});

	async function tarGz(file: string, entries: { name: string; body: Buffer }[]) {
		await pipeline(tarStream(entries.map((e) => ({ ...e, size: e.body.length }))), createGzip(), createWriteStream(file));
	}

	it('odrzuca obce ścieżki, brak manifestu, brak bazy, śmieci', async () => {
		const manifest = Buffer.from(JSON.stringify({ format: FORMAT, version: 1, app: '1', createdAt: new Date().toISOString(), schema: { tag: null, createdAt: 1 } }));
		const evil = join(ctx.dir, 'evil.tar.gz');
		await tarGz(evil, [{ name: 'manifest.json', body: manifest }, { name: '../../etc/passwd', body: Buffer.from('x') }]);
		await expect(extractArchive(evil, join(ctx.dir, 'e1'))).rejects.toThrow(/Nieoczekiwany plik/);
		const noManifest = join(ctx.dir, 'nm.tar.gz');
		await tarGz(noManifest, [{ name: 'kalendarz.db', body: Buffer.from('x') }]);
		await expect(extractArchive(noManifest, join(ctx.dir, 'e2'))).rejects.toThrow(/manifest/);
		const noDb = join(ctx.dir, 'nd.tar.gz');
		await tarGz(noDb, [{ name: 'manifest.json', body: manifest }]);
		await expect(extractArchive(noDb, join(ctx.dir, 'e3'))).rejects.toThrow(/brakuje bazy/);
		const junk = join(ctx.dir, 'junk.bin');
		await writeFile(junk, 'to nie jest kopia');
		await expect(extractArchive(junk, join(ctx.dir, 'e4'))).rejects.toThrow(/nie jest plik/);
		const broken = join(ctx.dir, 'db.tar.gz');
		await tarGz(broken, [{ name: 'manifest.json', body: manifest }, { name: 'kalendarz.db', body: Buffer.from('SQLite format 3\0' + 'x'.repeat(200)) }]);
		const x = await extractArchive(broken, join(ctx.dir, 'e5'));
		expect(() => inspectDb(x.dbFile)).toThrow(/spójności|nie jest plik/);
	});

	it('odrzuca bazę z nowszym schematem niż aplikacja', async () => {
		const file = join(ctx.dir, 'newer.db');
		await ctx.db.$client.backup(file);
		const s = new Database(file);
		s.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('future', appSchema().createdAt + 1000);
		s.close();
		expect(() => inspectDb(file)).toThrow(/nowszy schemat/);
	});
});

describe('harmonogram i rotacja', () => {
	it('termin: codziennie i co tydzień, przed i po godzinie', () => {
		const at = (iso: string) => new Date(iso);
		const daily = { freq: 'daily' as const, weekday: 1, time: '03:30' };
		// 2026-11-12 to czwartek; Europe/Berlin = UTC+1
		expect(B.dueSlot(daily, at('2026-11-12T02:00:00Z'))).toBe('2026-11-11');
		expect(B.dueSlot(daily, at('2026-11-12T02:31:00Z'))).toBe('2026-11-12');
		expect(B.dueSlot({ ...daily, freq: 'weekly', weekday: 4 }, at('2026-11-12T02:00:00Z'))).toBe('2026-11-05');
		expect(B.dueSlot({ ...daily, freq: 'weekly', weekday: 4 }, at('2026-11-12T03:00:00Z'))).toBe('2026-11-12');
		expect(B.dueSlot({ ...daily, freq: 'weekly', weekday: 1 }, at('2026-11-12T03:00:00Z'))).toBe('2026-11-09');
		expect(B.dueSlot({ ...daily, freq: 'off' }, at('2026-11-12T03:00:00Z'))).toBeNull();
	});

	it('rotacja: zostaje N najnowszych, stare kopie .db liczą się do puli, „przed przywróceniem” osobno (3)', () => {
		const names = [
			'kalendarz-2026-11-01.db',
			'kalendarz-2026-11-02-033000.tar.gz',
			'kalendarz-2026-11-03-033000.tar.gz.enc',
			'kalendarz-2026-11-03-120000.tar.gz',
			'inny.txt',
			...[1, 2, 3, 4].map((d) => `kalendarz-przed-przywroceniem-2026-11-0${d}-100000.tar.gz`)
		];
		expect(B.toRotate(names, 2).sort()).toEqual(
			['kalendarz-2026-11-01.db', 'kalendarz-2026-11-02-033000.tar.gz', 'kalendarz-przed-przywroceniem-2026-11-01-100000.tar.gz'].sort()
		);
	});

	it('kopia do folderu lokalnego z rotacją; zapis harmonogramu nie uruchamia kopii', async () => {
		const { dir, db } = await instance();
		const keep = join(dir, 'nas');
		await mkdir(keep);
		for (let d = 1; d <= 4; d++) await writeFile(join(keep, `kalendarz-2026-10-0${d}-033000.tar.gz`), '');
		await writeFile(join(keep, 'notatka.txt'), '');
		await B.saveTarget(db, form({ kind: 'local', name: 'NAS', path: keep, keep: '3' }));
		const r = await B.runBackup(db, { now: new Date('2026-11-12T09:00:05Z') });
		expect(r.targets.every((x) => x.ok)).toBe(true);
		expect(r.file).toBe('kalendarz-2026-11-12-100005.tar.gz');
		expect((await readdir(keep)).sort()).toEqual(['kalendarz-2026-10-03-033000.tar.gz', 'kalendarz-2026-10-04-033000.tar.gz', r.file, 'notatka.txt'].sort());
		// domyślne miejsce (data/backups) też dostało kopię
		expect(await readdir(join(dir, 'backups'))).toEqual([r.file]);
		const st = B.getState(db);
		expect(Object.values(st.targets).every((x) => x.ok && x.file === r.file)).toBe(true);
		expect(st.lastRun?.ok).toBe(true);
		B.saveSchedule(db, form({ freq: 'weekly', weekday: '1', time: '04:00' }), new Date('2026-11-12T09:00:00Z'));
		expect(B.getState(db).lastSlot).toBe('2026-11-09');
		expect(B.getConfig(db)).toMatchObject({ freq: 'weekly', weekday: 1, time: '04:00' });
	});

	it('walidacja miejsc: ścieżka względna, folder zdjęć, brak hasła WebDAV', async () => {
		const { dir, db } = await instance();
		await expect(B.saveTarget(db, form({ kind: 'local', path: 'kopie' }))).rejects.toThrow(/pełną ścieżkę/);
		await expect(B.saveTarget(db, form({ kind: 'local', path: join(dir, 'media', 'x') }))).rejects.toThrow(/zdjęć/);
		await expect(B.saveTarget(db, form({ kind: 'webdav', url: 'ftp://nas', user: 'a', password: 'b' }))).rejects.toThrow(/http/);
		await expect(B.saveTarget(db, form({ kind: 'webdav', url: 'https://nas/dav/', user: 'a' }))).rejects.toThrow(/hasło/);
		await expect(B.saveTarget(db, form({ kind: 'webdav', url: 'https://u:p@nas/dav/', user: 'a', password: 'b' }))).rejects.toThrow(/osobnych polach/);
	});

	it('błąd jednego miejsca nie zatrzymuje pozostałych i trafia do statusu', async () => {
		const { db } = await instance();
		const tg = await B.saveTarget(db, form({ kind: 'webdav', url: 'http://127.0.0.1:9/dav/', user: 'a', password: 'b' }));
		const r = await B.runBackup(db);
		expect(r.targets.find((x) => x.id === 'local')?.ok).toBe(true);
		expect(r.targets.find((x) => x.id === tg.id)).toMatchObject({ ok: false });
		expect(B.getState(db).targets[tg.id].error).toMatch(/nie odpowiada/);
		expect(B.getState(db).lastRun?.ok).toBe(false);
	});
});

describe('WebDAV', () => {
	let dav: Awaited<ReturnType<typeof startWebdav>>;
	beforeAll(async () => {
		dav = await startWebdav();
	});
	afterAll(() => dav.close());

	it('zakłada brakujące katalogi, wysyła przez .part + MOVE, listuje, pobiera, usuwa', async () => {
		const c = new Webdav({ url: `${dav.url}/remote.php/dav/files/ania/Kopie/kalendarz`, user: USER, password: PASSWORD });
		dav.dirs.add('/remote.php/');
		dav.dirs.add('/remote.php/dav/');
		dav.dirs.add('/remote.php/dav/files/');
		dav.dirs.add('/remote.php/dav/files/ania/');
		await c.ensureFolder();
		expect(dav.dirs.has('/remote.php/dav/files/ania/Kopie/kalendarz/')).toBe(true);
		const dir = await mkdtemp(join(tmpdir(), 'kal-dav-'));
		await writeFile(join(dir, 'a'), 'zawartość kopii');
		await c.upload('kalendarz-2026-11-12-033000.tar.gz', join(dir, 'a'));
		expect(dav.log.some((l: string) => l.startsWith('MOVE') && l.endsWith('.part'))).toBe(true);
		const list = await c.list();
		expect(list).toEqual([{ name: 'kalendarz-2026-11-12-033000.tar.gz', size: Buffer.byteLength('zawartość kopii'), modified: expect.any(String) }]);
		await c.download('kalendarz-2026-11-12-033000.tar.gz', join(dir, 'b'));
		expect(await readFile(join(dir, 'b'), 'utf8')).toBe('zawartość kopii');
		await c.remove('kalendarz-2026-11-12-033000.tar.gz');
		expect(await c.list()).toEqual([]);
	});

	it('złe hasło → czytelny błąd', async () => {
		const c = new Webdav({ url: `${dav.url}/`, user: USER, password: 'zle' });
		await expect(c.list()).rejects.toThrow(/401.*hasło/);
	});

	it('PROPFIND z innymi prefiksami przestrzeni nazw i zakodowanymi nazwami', () => {
		const xml = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:lp1="DAV:">
			<D:response><D:href>/dav/kopie/</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat></D:response>
			<D:response><D:href>/dav/kopie/kalendarz%2D2026-11-12-033000.tar.gz</D:href><D:propstat><D:prop><lp1:getcontentlength>42</lp1:getcontentlength><lp1:getlastmodified>Thu, 12 Nov 2026 02:30:00 GMT</lp1:getlastmodified></D:prop></D:propstat></D:response>
		</D:multistatus>`;
		expect(parseMultistatus(xml, new URL('http://nas/dav/kopie/'))).toEqual([
			{ name: 'kalendarz-2026-11-12-033000.tar.gz', size: 42, modified: '2026-11-12T02:30:00.000Z' }
		]);
	});

	it('kopia do WebDAV z rotacją i przywrócenie z listy', async () => {
		const { db } = await instance();
		const tg = await B.saveTarget(db, form({ kind: 'webdav', name: 'Chmura', url: `${dav.url}/kopie-${Date.now()}/`, user: USER, password: PASSWORD, keep: '2' }));
		// hasło tylko w secrets, nie w konfiguracji
		expect(JSON.stringify(getKv(db, B.CONFIG_KEY, null))).not.toContain(PASSWORD);
		for (const s of ['01', '02', '03']) await B.runBackup(db, { now: new Date(`2026-11-12T09:00:${s}Z`) });
		const files = await B.listTarget(db, tg.id);
		expect(files.map((f) => f.name)).toEqual(['kalendarz-2026-11-12-100003.tar.gz', 'kalendarz-2026-11-12-100002.tar.gz']);
		expect(B.getState(db).targets[tg.id]).toMatchObject({ ok: true, file: 'kalendarz-2026-11-12-100003.tar.gz' });
		const p = await prepareFromTarget(db, tg.id, files[0].name);
		expect(p.source).toBe(files[0].name);
		await cancelRestore();
	});
});

describe('przywracanie', () => {
	it('podmienia bazę i zdjęcia, robi kopię „przed”, zostawia ustawienia kopii', async () => {
		// Kopia z instancji A
		const a = await instance();
		await addMedia(a.dir);
		addMember(a.db, 'ola', 'Ola');
		const archive = join(a.dir, 'a.tar.gz.enc');
		await createArchive(a.db, archive, { passphrase: 'haslo-kopii-1' });

		// Instancja B z innymi danymi i własnymi ustawieniami kopii
		const b = await instance();
		addMember(b.db, 'jan', 'Jan');
		await mkdir(join(b.dir, 'media', 'photos'), { recursive: true });
		await writeFile(join(b.dir, 'media', 'photos', 'stare-1.jpg'), JPG);
		const tg = await B.saveTarget(b.db, form({ kind: 'webdav', url: 'https://nas.example/dav/', user: 'b', password: 'sekret-b' }));
		B.savePassphrase(b.db, form({ passphrase: 'haslo-kopii-1', passphrase2: 'haslo-kopii-1' }));

		const p = await prepareRestore(b.db, archive, { source: 'a.tar.gz.enc' });
		expect(p).toMatchObject({ encrypted: true, legacy: false, media: { photos: 1, avatars: 1 } });
		expect(p.info.counts.members).toBe(1);
		expect(pendingRestore()?.id).toBe(p.id);
		await expect(confirmRestore(b.db, 'inny')).rejects.toThrow(/Najpierw sprawdź/);

		const running = confirmRestore(b.db, p.id);
		// W trakcie: żądania dostają 503 (hooks), /healthz nie
		expect(B.blockedByRestore('/api/notes')).toBe(true);
		expect(B.blockedByRestore('/')).toBe(true);
		expect(B.blockedByRestore('/healthz')).toBe(false);
		const before = await running;
		expect(B.blockedByRestore('/api/notes')).toBe(false);
		expect(b.db.select().from(members).all().map((m) => m.id)).toEqual(['ola']);
		expect((await readdir(join(b.dir, 'media', 'photos'))).sort()).toEqual(['lato-abc.jpg']);
		expect(await readdir(join(b.dir, 'media', 'avatars'))).toEqual(['ola-x1.png']);
		expect(B.getConfig(b.db).targets.map((x) => x.id)).toContain(tg.id);
		expect(B.hasPassphrase(b.db)).toBe(true);
		expect(pendingRestore()).toBeNull();
		// „przed przywróceniem” ma dane B (Jan i stare zdjęcie)
		expect(before).toMatch(/kalendarz-przed-przywroceniem-.*\.tar\.gz\.enc$/);
		const x = await extractArchive(before, join(b.dir, 'chk'), { passphrase: 'haslo-kopii-1' });
		const s = new Database(x.dbFile, { readonly: true });
		expect(s.prepare('SELECT id FROM members').all()).toEqual([{ id: 'jan' }]);
		s.close();
		expect(await readdir(join(x.mediaDir!, 'photos'))).toEqual(['stare-1.jpg']);
		// po przywróceniu nie zostają katalogi tymczasowe
		expect((await readdir(b.dir)).filter((f) => f.startsWith('media.old'))).toEqual([]);
		expect(await readdir(join(b.dir, '.kalendarz.db.work', 'backup'))).toEqual([]);
		expect(await readdir(join(b.dir, '.kalendarz.db.work', 'restore'))).toEqual([]);
	});

	it('kopia ze starszego schematu: migracje uruchamiają się przy przywracaniu', async () => {
		const all = appMigrations();
		expect(all.length).toBeGreaterThan(3);
		// Baza „ze starszej wersji”: tylko migracje bez dwóch ostatnich.
		const old = await mkdtemp(join(tmpdir(), 'kal-old-'));
		await cp('drizzle', join(old, 'drizzle'), { recursive: true });
		const journal = JSON.parse(await readFile(join(old, 'drizzle/meta/_journal.json'), 'utf8'));
		journal.entries = journal.entries.slice(0, -2);
		await writeFile(join(old, 'drizzle/meta/_journal.json'), JSON.stringify(journal));
		const sqlite = new Database(join(old, 'old.db'));
		const oldDb = drizzle(sqlite);
		migrate(oldDb, { migrationsFolder: join(old, 'drizzle') });
		sqlite.prepare("INSERT INTO members (id, name, color, sort_order) VALUES ('babcia', 'Babcia', '#aa0000', 0)").run();
		const archive = join(old, 'old.tar.gz');
		await createArchive(Object.assign(oldDb, { $client: sqlite }) as unknown as DB, archive);
		sqlite.close();

		const live = await instance();
		const p = await prepareRestore(live.db, archive, { source: 'old.tar.gz' });
		expect(p.info.pending).toBe(2);
		expect(p.info.schema.tag).toBe(all.at(-3)!.tag);
		await confirmRestore(live.db, p.id);
		expect(live.db.select().from(members).all().map((m) => m.id)).toEqual(['babcia']);
		const applied = live.db.$client.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get() as { c: number };
		expect(applied.c).toBe(all.length);
		expect(inspectDb(live.db.$client.name).pending).toBe(0);
	});

	it('stara kopia samej bazy (.db) – zdjęcia bez zmian', async () => {
		const a = await instance();
		addMember(a.db, 'ola', 'Ola');
		const legacy = join(a.dir, 'kalendarz-2026-10-01.db');
		await a.db.$client.backup(legacy);
		const b = await instance();
		await addMedia(b.dir);
		const p = await prepareRestore(b.db, legacy, { source: 'kalendarz-2026-10-01.db' });
		expect(p).toMatchObject({ legacy: true, media: null });
		await confirmRestore(b.db, p.id);
		expect(b.db.select().from(members).all().map((m) => m.id)).toEqual(['ola']);
		expect(await readdir(join(b.dir, 'media', 'photos'))).toEqual(['lato-abc.jpg']);
	});

	it('wgrywanie w kawałkach: kolejność i identyfikator sprawdzane', async () => {
		const { db } = await instance();
		const id = 'a'.repeat(32);
		expect(await saveUploadChunk(db, id, 0, Buffer.from('abc'))).toBe(3);
		expect(await saveUploadChunk(db, id, 3, Buffer.from('de'))).toBe(5);
		await expect(saveUploadChunk(db, id, 10, Buffer.from('x'))).rejects.toThrow(/przerwane/);
		await expect(saveUploadChunk(db, '../x', 0, Buffer.from('x'))).rejects.toThrow(/przerwane/);
		expect(await readFile(uploadedFile(db, id), 'utf8')).toBe('abcde');
	});
});

describe('pobranie świeżej kopii tylko z tej samej strony', () => {
	const O = 'https://kalendarz.example.ts.net';
	it('Sec-Fetch-Site: panel i pasek adresu – tak; obca strona – nie; bez nagłówka – Origin', () => {
		expect(B.sameOriginRequest(new Headers({ 'sec-fetch-site': 'same-origin' }), O)).toBe(true);
		expect(B.sameOriginRequest(new Headers({ 'sec-fetch-site': 'none' }), O)).toBe(true);
		expect(B.sameOriginRequest(new Headers({ 'sec-fetch-site': 'cross-site' }), O)).toBe(false);
		expect(B.sameOriginRequest(new Headers({ 'sec-fetch-site': 'same-site', origin: O }), O)).toBe(false);
		expect(B.sameOriginRequest(new Headers({ origin: O }), O)).toBe(true);
		expect(B.sameOriginRequest(new Headers({ origin: 'https://zly.example' }), O)).toBe(false);
		expect(B.sameOriginRequest(new Headers(), O)).toBe(false);
	});
	it('jedno archiwum naraz', async () => {
		let release!: () => void;
		const first = B.exclusive('download', () => new Promise<void>((r) => (release = r)));
		await expect(B.exclusive('download', async () => 1)).rejects.toThrow();
		release();
		await first;
	});
});


describe('wolne miejsce na dysku', () => {
	it('liczy z najbliższego istniejącego katalogu; mało miejsca względem rozmiaru kopii', async () => {
		const s = await B.diskSpace(join(tmpdir(), 'nie-ma-takiego', 'folderu'));
		expect(s && s.free > 0 && s.total >= s.free).toBe(true);
		const huge = await B.diskSpace(tmpdir(), Number.MAX_SAFE_INTEGER / 4);
		expect(huge?.low).toBe(true);
	});
});
