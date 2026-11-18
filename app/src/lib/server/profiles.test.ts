import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { members } from './db/schema';
import { InputError } from './store';
import { deleteMember, saveMember } from './admin';
import { clearAvatar, parseEmoji, saveAvatar } from './profiles';
import { listPhotos, mediaRoot, readMedia, removeByUrl, saveImage, sniff } from './media';
import { buildDashboard } from './dashboard';
import { setSetting } from './sync';
import { saveModules } from '#lib/modules/registry.server.js';
import { DEFAULT_REGION, setRegion } from '#lib/region.js';
import { setLang } from '#lib/i18n/index.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

let dir: string;
beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'kal-media-'));
	process.env.MEDIA_DIR = dir;
});
afterAll(() => {
	delete process.env.MEDIA_DIR;
	rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
	setRegion(DEFAULT_REGION);
	setLang('pl');
});

const form = (o: Record<string, string | Blob>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return f;
};
const fresh = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};
const row = (db: ReturnType<typeof fresh>, id: string) => db.select().from(members).where(eq(members.id, id)).get()!;

describe('zdjęcia na woluminie danych', () => {
	it('format po bajtach, nie po nazwie', () => {
		expect(sniff(JPEG)).toBe('jpg');
		expect(sniff(PNG)).toBe('png');
		expect(sniff(WEBP)).toBe('webp');
		expect(sniff(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
	});

	it('zapis, lista, odczyt i usunięcie; złe nazwy nie przechodzą', async () => {
		expect(mediaRoot()).toBe(dir);
		const name = await saveImage('photos', new Blob([JPEG]));
		expect(name).toMatch(/^[a-z0-9]+-[0-9a-f]{8}\.jpg$/);
		expect(listPhotos().map((p) => p.file)).toEqual([name]);
		expect(readMedia('photos', name)?.type).toBe('image/jpeg');
		expect(readMedia('photos', '../kalendarz.db')).toBeNull();
		expect(readMedia('backups', name)).toBeNull();
		await expect(saveImage('photos', new Blob(['<script>']))).rejects.toThrow(InputError);
		await expect(saveImage('photos', new Blob([]))).rejects.toThrow(InputError);
		await expect(saveImage('avatars', new Blob([JPEG, new Uint8Array(3 * 1024 * 1024)]))).rejects.toThrow(InputError);
		removeByUrl(`/media/photos/${name}`);
		expect(listPhotos()).toEqual([]);
	});
});

describe('profil domownika', () => {
	it('urodziny (z rokiem i bez) i imię do imienin z formularza; nowa osoba bez tych pól', () => {
		const db = fresh();
		const base = { id: 'ola', name: 'Ola', color: '#c026d3', calendarIds: '', emails: '' };
		saveMember(db, form({ ...base, birthday: '2019-11-15', nameDay: 'Aleksandra' }));
		expect(row(db, 'ola')).toMatchObject({ birthday: '2019-11-15', nameDay: 'Aleksandra' });
		saveMember(db, form({ ...base, birthday: '2000-02-29', noYear: 'on', nameDay: '' }));
		expect(row(db, 'ola')).toMatchObject({ birthday: '--02-29', nameDay: null });
		saveMember(db, form({ ...base, birthday: '' }));
		expect(row(db, 'ola').birthday).toBeNull();
		expect(() => saveMember(db, form({ ...base, birthday: '2019-02-30' }))).toThrow(InputError);
		// formularz „nowa osoba” nie ma pól profilu
		saveMember(db, form({ name: 'Dziadek', color: '#0ea5e9', calendarIds: '', emails: '' }));
		expect(row(db, 'dziadek')).toMatchObject({ birthday: null, nameDay: null, avatar: null });
	});

	it('emoji: jeden–dwa znaki, szybki wybór ma pierwszeństwo', async () => {
		expect(parseEmoji('🦊')).toBe('🦊');
		expect(parseEmoji('👩‍👧')).toBe('👩‍👧');
		expect(parseEmoji('AW')).toBe('AW');
		for (const bad of ['', 'abc', '/media/avatars/x.jpg']) expect(() => parseEmoji(bad), bad).toThrow(InputError);
		const db = fresh();
		await saveAvatar(db, form({ id: 'kuba', emoji: '🐻', pick: '🦊' }));
		expect(row(db, 'kuba').avatar).toBe('🦊');
		await expect(saveAvatar(db, form({ id: 'nikt', emoji: '🐻' }))).rejects.toThrow(InputError);
	});

	it('zdjęcie zastępuje emoji; nowe zdjęcie, usunięcie awatara i osoby sprzątają pliki', async () => {
		const db = fresh();
		await saveAvatar(db, form({ id: 'ola', photo: new Blob([JPEG]) }));
		const first = row(db, 'ola').avatar!;
		expect(first).toMatch(/^\/media\/avatars\/ola-[a-z0-9]+-[0-9a-f]{8}\.jpg$/);
		const file = (url: string) => join(dir, 'avatars', url.split('/').pop()!);
		expect(existsSync(file(first))).toBe(true);
		await saveAvatar(db, form({ id: 'ola', photo: new Blob([PNG]) }));
		const second = row(db, 'ola').avatar!;
		expect(existsSync(file(first))).toBe(false);
		clearAvatar(db, form({ id: 'ola' }));
		expect(row(db, 'ola').avatar).toBeNull();
		expect(existsSync(file(second))).toBe(false);
		await saveAvatar(db, form({ id: 'ola', photo: new Blob([JPEG]) }));
		const third = row(db, 'ola').avatar!;
		deleteMember(db, form({ id: 'ola' }));
		expect(existsSync(file(third))).toBe(false);
	});
});

describe('moduł urodziny i imieniny na ekranie', () => {
	const AT = new Date('2026-11-12T10:00:00Z');

	it('urodziny jako wydarzenia całodniowe z wiekiem i odliczanie', () => {
		const db = fresh();
		db.update(members).set({ birthday: '2019-11-15' }).where(eq(members.id, 'ola')).run();
		db.update(members).set({ birthday: '--11-12' }).where(eq(members.id, 'kuba')).run();
		db.update(members).set({ birthday: '1950-03-01' }).where(eq(members.id, 'babcia')).run();
		const d = buildDashboard(db, AT);
		const bd = d.events.filter((e) => e.kind === 'birthday');
		expect(bd.map((e) => [e.start, e.title, e.memberId])).toEqual([
			['2026-11-15', 'Urodziny Oli · 7 lat', 'ola'],
			['2026-11-12', 'Urodziny Kuby', 'kuba']
		]);
		expect(bd[0]).toMatchObject({ allDay: true, end: '2026-11-16' });
		expect(d.modules.birthdays?.upcoming.map((u) => [u.memberId, u.days, u.age])).toEqual([
			['kuba', 0, null],
			['ola', 3, 7]
		]);
		// odliczanie w ustawieniach modułu
		saveModules(db, { birthdays: { config: { countdownDays: 1 } } });
		expect(buildDashboard(db, AT).modules.birthdays?.upcoming.map((u) => u.memberId)).toEqual(['kuba']);
		setLang('de');
		expect(buildDashboard(db, AT).events.find((e) => e.memberId === 'ola' && e.kind === 'birthday')?.title).toBe('Olas Geburtstag · 7 Jahre');
	});

	it('imieniny tylko w Polsce, z wyróżnieniem domownika; ustawienie wyłącza', () => {
		const db = fresh();
		expect(buildDashboard(db, AT).modules.birthdays?.namedays).toBeNull();
		setSetting(db, 'region', { country: 'PL', subdivision: 'PL-MZ', timezone: 'Europe/Warsaw' });
		db.update(members).set({ nameDay: 'Witold' }).where(eq(members.id, 'tata')).run();
		db.update(members).set({ name: 'Renata' }).where(eq(members.id, 'mama')).run();
		expect(buildDashboard(db, AT).modules.birthdays?.namedays).toEqual({ names: ['Renaty', 'Witolda'], members: ['tata', 'mama'] });
		saveModules(db, { birthdays: { config: { namedays: false } } });
		expect(buildDashboard(db, AT).modules.birthdays?.namedays).toBeNull();
	});

	it('wygaszacz: wyłączony domyślnie, po włączeniu zdjęcia i ustawienia', async () => {
		const db = fresh();
		expect(buildDashboard(db, AT).modules.screensaver).toBeUndefined();
		saveModules(db, { screensaver: { enabled: true, config: { idleMinutes: 2 } } });
		const name = await saveImage('photos', new Blob([JPEG]));
		expect(buildDashboard(db, AT).modules.screensaver).toEqual({ photos: [`/media/photos/${name}`], idleMinutes: 2, slideSeconds: 12, clock: true });
		removeByUrl(`/media/photos/${name}`);
	});
});
