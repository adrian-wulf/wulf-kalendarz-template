import { createLocalCalendar, createSubscription, resolveLayers, upsertLayer } from './calendars.js';
import { sourceCache } from './db/schema.js';
import { describe, expect, it } from 'vitest';
import { openDb, type DB } from './db/index.js';
import { haEntities, members, secrets } from './db/schema.js';
import { setSetting } from './sync.js';
import { setKv } from './kv.js';
import { setClient, setRoles, NO_ROLES } from './google.js';
import { setBringConfig } from './bring.js';
import { setPin } from './security.js';
import { CONFIG_KEY, DEFAULT_CONFIG, STATE_KEY } from './backup.js';
import { saveHaAuth } from './homeassistant.js';
import { setStop } from './transit/index.js';
import { saveModules, seedModules } from '#lib/modules/registry.server.js';
import { checklist, detectTips, dismissTip, markPhoneSeen, restoreTips, tipState } from './checklist.js';
import { addManualPickups, datesFromForm, deleteManualBin } from './waste-admin.js';
import { getSetting } from './sync.js';

const TODAY = '2026-11-12';

function fresh(): DB {
	const db = openDb(':memory:');
	seedModules(db);
	return db;
}
const secret = (db: DB, key: string, value: unknown) => db.insert(secrets).values({ key, value: JSON.stringify(value) }).run();
const state = (db: DB, id: string) => detectTips(db, TODAY).find((x) => x.id === id)?.state;
const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('„Co jeszcze możesz podłączyć” – wykrywanie', () => {
	it('świeża instalacja: nic nie jest gotowe, Kalendarze też liczone', () => {
		const db = fresh();
		const c = checklist(db, TODAY);
		expect(c.items.map((i) => i.id)).toEqual(['google', 'calendars', 'waste', 'bring', 'birthdays', 'phones', 'backup', 'pin']);
		expect(c.done).toBe(0);
		expect(c.total).toBe(8);
		expect(c.items.find((i) => i.id === 'calendars')).toMatchObject({ state: 'todo', href: '/admin/kalendarze' });
		expect(c.items.find((i) => i.id === 'google')?.href).toBe('/admin/google?guide=google');
	});

	it('Kalendarze: subskrypcja z błędem = zaczęte, działająca albo import = gotowe, ukryta na kiosku się nie liczy', () => {
		const db = fresh();
		const sub = createSubscription(db, { name: 'Klub', url: 'https://klub.example/k.ics', color: null, icon: '', memberId: null, refreshMinutes: 60 });
		expect(state(db, 'calendars')).toBe('done'); // jeszcze nie pobrana – bez błędu
		db.insert(sourceCache).values({ source: sub, lastError: 'HTTP 404', lastErrorAt: '2026-11-12T10:00:00Z' }).run();
		expect(state(db, 'calendars')).toBe('started');
		const imp = createLocalCalendar(db, { name: 'Szkoła', color: null, icon: '', memberId: null });
		expect(state(db, 'calendars')).toBe('done');
		upsertLayer(db, resolveLayers(db).find((l) => l.id === imp)!, { showKiosk: false });
		expect(state(db, 'calendars')).toBe('started');
		expect(checklist(db, TODAY).total).toBe(8);
	});

	it('Google: połączone bez kalendarza „Rodzina” = zaczęte, z nim = gotowe', () => {
		const db = fresh();
		setClient(db, { id: 'x.apps.googleusercontent.com', secret: 's' });
		expect(state(db, 'google')).toBe('todo');
		secret(db, 'google.refresh', 'token');
		expect(state(db, 'google')).toBe('started');
		setRoles(db, { ...NO_ROLES, family: 'rodzina@group.calendar.google.com' });
		expect(state(db, 'google')).toBe('done');
	});

	it('Bring!: konto bez listy = zaczęte, z listą = gotowe; wyłączone zakupy – pozycji nie ma', () => {
		const db = fresh();
		secret(db, 'bring.auth', { email: 'a@b.c', password: 'p', uuid: 'u', accessToken: 't', refreshToken: 'r', expires: 0 });
		expect(state(db, 'bring')).toBe('started');
		setBringConfig(db, { listUuid: 'l', listName: 'Dom' });
		expect(state(db, 'bring')).toBe('done');
		saveModules(db, { shopping: { enabled: false } });
		expect(state(db, 'bring')).toBeUndefined();
	});

	it('śmieci: adres, plik albo przyszły termin ręczny; przeszłe terminy i dane przykładowe się nie liczą', () => {
		const db = fresh();
		expect(state(db, 'waste')).toBe('todo');
		setSetting(db, 'wasteManual', [{ date: '2026-01-05', bin: 'papier' }]);
		expect(state(db, 'waste')).toBe('todo');
		setSetting(db, 'wasteManual', [{ date: '2026-11-20', bin: 'papier' }]);
		expect(state(db, 'waste')).toBe('done');
		setSetting(db, 'wasteManual', []);
		setSetting(db, 'wasteIcalUrl', 'https://example.com/abfuhr.ics');
		expect(state(db, 'waste')).toBe('done');
	});

	it('urodziny, telefon, PIN', async () => {
		const db = fresh();
		db.insert(members).values({ id: 'ewa', name: 'Ewa', color: '#0ea5e9' }).run();
		expect(state(db, 'birthdays')).toBe('todo');
		db.insert(members).values({ id: 'jan', name: 'Jan', color: '#db2777', birthday: '--03-14' }).run();
		expect(state(db, 'birthdays')).toBe('done');
		expect(state(db, 'phones')).toBe('todo');
		markPhoneSeen(db, new Date('2026-11-12T10:00:00Z'));
		markPhoneSeen(db, new Date('2026-11-13T10:00:00Z'));
		expect(state(db, 'phones')).toBe('done');
		expect(state(db, 'pin')).toBe('todo');
		await setPin(db, '4321', '4321');
		expect(state(db, 'pin')).toBe('done');
	});

	it('kopia poza komputerem: sam folder domyślny – nic; WebDAV bez udanej kopii – zaczęte; z udaną – gotowe', () => {
		const db = fresh();
		expect(state(db, 'backup')).toBe('todo');
		const dav = { id: 'nc', kind: 'webdav' as const, name: 'Nextcloud', path: '', url: 'https://nc.example/dav/', user: 'u', keep: 14, enabled: true };
		setKv(db, CONFIG_KEY, { ...DEFAULT_CONFIG, targets: [...DEFAULT_CONFIG.targets, dav] });
		expect(state(db, 'backup')).toBe('started');
		setKv(db, STATE_KEY, { lastSlot: null, lastRun: null, targets: { nc: { at: '2026-11-12T03:30:00Z', ok: false, error: '401' } } });
		expect(state(db, 'backup')).toBe('started');
		setKv(db, STATE_KEY, { lastSlot: null, lastRun: null, targets: { nc: { at: '2026-11-12T03:30:00Z', ok: true } } });
		expect(state(db, 'backup')).toBe('done');
		// wyłączone miejsce się nie liczy
		setKv(db, CONFIG_KEY, { ...DEFAULT_CONFIG, targets: [...DEFAULT_CONFIG.targets, { ...dav, enabled: false }] });
		expect(state(db, 'backup')).toBe('todo');
	});

	it('odjazdy i Home Assistant tylko z włączonym modułem', () => {
		const db = fresh();
		expect(state(db, 'transit')).toBeUndefined();
		saveModules(db, { transit: { enabled: true }, homeassistant: { enabled: true } });
		expect(state(db, 'transit')).toBe('todo');
		setStop(db, { provider: 'gtfs', id: 's1', name: 'Rondo' });
		expect(state(db, 'transit')).toBe('done');
		expect(state(db, 'ha')).toBe('todo');
		saveHaAuth(db, form({ url: 'http://192.168.1.20:8123', token: 'abc' }));
		expect(state(db, 'ha')).toBe('started');
		db.insert(haEntities).values({ entityId: 'light.kuchnia' }).run();
		expect(state(db, 'ha')).toBe('done');
		expect(tipState(db, 'ha', TODAY)).toBe('done');
	});

	it('ukrywanie: ukryta pozycja nie liczy się do postępu, nieznany identyfikator jest pomijany, „Pokaż ukryte” przywraca', () => {
		const db = fresh();
		setSetting(db, 'wasteIcalUrl', 'https://example.com/a.ics');
		expect(checklist(db, TODAY)).toMatchObject({ done: 1, total: 8 });
		dismissTip(db, 'bring');
		dismissTip(db, 'bring');
		dismissTip(db, 'nie-ma-takiej');
		const c = checklist(db, TODAY);
		expect(c).toMatchObject({ done: 1, total: 7 });
		expect(c.items.filter((i) => i.dismissed).map((i) => i.id)).toEqual(['bring']);
		restoreTips(db);
		expect(checklist(db, TODAY).total).toBe(8);
	});
});

describe('śmieci: zapis całego roku z panelu', () => {
	it('seria co 2 tygodnie: daty sprzed dziś pominięte, powtórki nie dublują się', () => {
		const db = fresh();
		const f = form({ mode: 'series', bin: 'papier', first: '2026-11-03', to: '2026-12-31', every: '2' });
		expect(datesFromForm(f, TODAY)).toEqual(['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
		expect(addManualPickups(db, f, TODAY)).toBe(4);
		expect(addManualPickups(db, f, TODAY)).toBe(0);
		expect(getSetting(db, 'wasteManual')).toHaveLength(4);
		expect(state(db, 'waste')).toBe('done');
	});

	it('wklejona lista z rokiem z formularza; usuwanie całego pojemnika zostawia inne', () => {
		const db = fresh();
		addManualPickups(db, form({ mode: 'list', bin: 'glas', text: 'styczeń: 12, 26\n9.02', year: '2027' }), TODAY);
		addManualPickups(db, form({ mode: 'series', bin: 'papier', first: '2026-11-20', to: '2026-11-30', every: '1' }), TODAY);
		expect(getSetting(db, 'wasteManual').map((p) => `${p.date}:${p.bin}`)).toEqual(['2026-11-20:papier', '2026-11-27:papier', '2027-01-12:glas', '2027-01-26:glas', '2027-02-09:glas']);
		deleteManualBin(db, form({ bin: 'glas' }), TODAY);
		expect(getSetting(db, 'wasteManual').map((p) => p.bin)).toEqual(['papier', 'papier']);
	});

	it('błędy: nieznany pojemnik, brak przyszłych dat', () => {
		const db = fresh();
		expect(() => addManualPickups(db, form({ mode: 'series', bin: 'nie-ma', first: '2026-11-20', to: '2026-12-31', every: '1' }), TODAY)).toThrow();
		expect(() => addManualPickups(db, form({ mode: 'list', bin: 'papier', text: '1.01.2026', year: '2026' }), TODAY)).toThrow();
	});
});
