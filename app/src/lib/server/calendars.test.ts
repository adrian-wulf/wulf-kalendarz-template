import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDb, type DB } from './db/index.js';
import { calendars, localEvents, secrets } from './db/schema.js';
import { seedMembers } from './db/seed.js';
import { setClient, setRoles } from './google.js';
import { readCache, refresh } from './sync.js';
import { buildDashboard } from './dashboard.js';
import {
	applyLayers,
	createLocalCalendar,
	createSubscription,
	deleteLayer,
	hiddenToday,
	layerIdOf,
	moveLayer,
	phoneHidden,
	resolveLayers,
	setHiddenToday,
	setPhoneHidden,
	upsertLayer,
	visibleOn
} from './calendars.js';
import { assertPublicHost, fetchIcalText, icalEventsBetween, icalInstant, ianaZone, isPrivateAddress, normalizeIcalUrl, subscriptionSource } from './sources/subscription.js';
import { parseIcal } from './sources/ical.js';
import { readIcs, writeImport, previewIcs, importIcs } from './ics-import.js';
import { eventColor, eventIcon } from '#lib/calendars.js';
import { setTimeZone } from '#lib/logic/dates.js';
import type { CalEvent } from '#lib/types.js';

setTimeZone('Europe/Berlin');

const NOW = new Date('2026-11-12T14:40:00Z');
const TODAY = '2026-11-12';

function db0(): DB {
	const db = openDb(':memory:');
	seedMembers(db);
	return db;
}

const cal = (lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Klub', ...lines, 'END:VCALENDAR'].join('\r\n');
const vevent = (...p: string[]) => ['BEGIN:VEVENT', ...p, 'END:VEVENT'];

const CLUB = cal([
	...vevent('UID:t1', 'DTSTART;TZID=Europe/Berlin:20261114T100000', 'DTEND;TZID=Europe/Berlin:20261114T113000', 'SUMMARY:Trening', 'LOCATION:Hala\\, boisko 2'),
	...vevent('UID:m1', 'DTSTART;VALUE=DATE:20261121', 'DTEND;VALUE=DATE:20261123', 'SUMMARY:Turniej'),
	...vevent('UID:w1', 'DTSTART:20261116T170000Z', 'DURATION:PT45M', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Basen'),
	...vevent('UID:old', 'DTSTART;VALUE=DATE:20260101', 'SUMMARY:Stary mecz')
]);

/** Fetcher z odpowiedziami po adresie (bez sieci). */
const fakeFetch =
	(routes: Record<string, () => Response>) =>
	async (input: string | URL | Request): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const r = routes[url];
		return r ? r() : new Response('nope', { status: 404 });
	};
const ics = (text: string) => () => new Response(text, { headers: { 'content-type': 'text/calendar' } });

describe('warstwy: rozpoznanie i domyślne (migracja)', () => {
	it('świeża instalacja i aktualizacja: wszystko widoczne, kolory automatycznie, bez wierszy w tabeli', () => {
		const db = db0();
		expect(db.select().from(calendars).all()).toEqual([]);
		const layers = resolveLayers(db);
		expect(layers.map((l) => l.id)).toEqual(['local', 'birthdays', 'waste', 'ferien', 'holidays']);
		for (const l of layers) expect([l.showKiosk, l.showPhone, l.color]).toEqual([true, true, null]);
		expect(layers.find((l) => l.id === 'waste')?.icon).toBe('🗑');
	});

	it('wpisy sprzed warstw trafiają do kalendarza „local” (domyślna wartość kolumny)', () => {
		const db = db0();
		db.run(sql`insert into local_events (id, title, start, "end", all_day) values ('x', 'Stare', '2026-11-13', '2026-11-14', 1)`);
		expect(db.select().from(localEvents).all()[0].calendarId).toBe('local');
	});

	it('Google: role i kalendarze domowników, ten sam kalendarz w dwóch rolach raz; osoba z przypisania w Google', () => {
		const db = db0();
		setClient(db, { id: 'c', secret: 's' });
		db.insert(secrets).values({ key: 'google.refresh', value: JSON.stringify('r') }).run();
		setRoles(db, { family: 'fam', notes: 'notes', kita: 'kita', birthdays: null });
		db.run(sql`update members set calendar_ids = '["mama@example.com","fam"]' where id = 'mama'`);
		const layers = resolveLayers(db);
		expect(layers.slice(0, 3).map((l) => [l.id, l.memberId])).toEqual([
			['google:fam', null],
			['google:mama@example.com', 'mama'],
			['google:kita', null]
		]);
		expect(layers.find((l) => l.id === 'google:mama@example.com')?.memberFromGoogle).toBe(true);
		// Kartki to nie wydarzenia – bez warstwy.
		expect(layers.some((l) => l.id === 'google:notes')).toBe(false);
	});

	it('wyłączony moduł = brak jego warstwy', async () => {
		const db = db0();
		const { saveModules } = await import('#lib/modules/registry.server.js');
		saveModules(db, { waste: { enabled: false }, holidays: { enabled: false } });
		expect(resolveLayers(db).map((l) => l.id)).toEqual(['local', 'birthdays']);
	});

	it('warstwa wydarzenia z identyfikatora (pamięć podręczna sprzed warstw)', () => {
		const e = (id: string): CalEvent => ({ id, title: '', start: TODAY, end: TODAY, allDay: true, memberId: null, kind: 'event' });
		expect(['g:fam:abc', 'birthday:ola:2026-11-20', 'waste-2026-11-13-gelb', 'putout-x', 'ferien-1', 'uuid'].map((id) => layerIdOf(e(id)))).toEqual([
			'google:fam',
			'birthdays',
			'waste',
			'waste',
			'ferien',
			'local'
		]);
		expect(layerIdOf({ ...e('x'), calendarId: 'ical:1' })).toBe('ical:1');
	});

	it('kolejność: przesunięcie zapisuje jawną kolejność, nowy kalendarz na końcu', () => {
		const db = db0();
		moveLayer(db, 'waste', 'up');
		expect(resolveLayers(db).map((l) => l.id)).toEqual(['local', 'waste', 'birthdays', 'ferien', 'holidays']);
		const id = createLocalCalendar(db, { name: 'Szkoła', color: null, icon: '🏫', memberId: 'ola' });
		expect(resolveLayers(db).at(-1)?.id).toBe(id);
		expect(resolveLayers(db).at(-1)?.color).toMatch(/^#/);
	});
});

describe('widoczność na kiosku i telefonie', () => {
	const ev = (id: string, calendarId: string, memberId: string | null = null, kind: CalEvent['kind'] = 'event'): CalEvent => ({
		id,
		title: id,
		start: TODAY,
		end: '2026-11-13',
		allDay: true,
		memberId,
		kind,
		calendarId
	});

	it('panel ukrywa na stałe osobno na kiosku i telefonie; kiosk do północy tylko na kiosku', () => {
		const db = db0();
		const id = createLocalCalendar(db, { name: 'Praca', color: '#2563eb', icon: '💼', memberId: 'tata' });
		const layers = () => resolveLayers(db);
		const events = [ev('a', id), ev('b', 'local', 'mama'), ev('c', 'waste', null, 'waste')];
		expect(applyLayers(events, layers(), 'kiosk').map((e) => e.id)).toEqual(['a', 'b', 'c']);
		upsertLayer(db, layers().find((l) => l.id === id)!, { showKiosk: false });
		expect(applyLayers(events, layers(), 'kiosk').map((e) => e.id)).toEqual(['b', 'c']);
		expect(applyLayers(events, layers(), 'phone').map((e) => e.id)).toEqual(['a', 'b', 'c']);

		setHiddenToday(db, 'local', true, TODAY);
		expect(hiddenToday(db, TODAY)).toEqual(new Set(['local']));
		expect(hiddenToday(db, '2026-11-13')).toEqual(new Set()); // po północy znowu widoczny
		expect(applyLayers(events, layers(), 'kiosk', hiddenToday(db, TODAY)).map((e) => e.id)).toEqual(['c']);
		expect(visibleOn(layers().find((l) => l.id === 'local')!, 'phone')).toBe(true);
		expect(() => setHiddenToday(db, 'nie-ma', true, TODAY)).toThrow();
	});

	it('kolor i ikona: kalendarz z kolorem > osoba; śmieci zawsze kolor pojemnika; domownik kalendarza', () => {
		const db = db0();
		const id = createLocalCalendar(db, { name: 'Klub', color: '#16a34a', icon: '⚽', memberId: 'kuba' });
		const [a, b, c] = applyLayers([ev('a', id), ev('b', 'local', 'mama'), { ...ev('c', 'waste', null, 'waste'), bin: 'gelb', binColor: '#facc15' }], resolveLayers(db), 'kiosk');
		expect([a.color, a.memberId, eventIcon(a)]).toEqual(['#16a34a', 'kuba', '⚽ ']);
		expect(eventColor(a, { color: '#dc2626' })).toBe('#16a34a');
		// „Automatycznie” – jak przed warstwami: kolor osoby.
		expect([b.color, eventColor(b, { color: '#e0457b' }), eventIcon(b)]).toEqual([undefined, '#e0457b', '']);
		upsertLayer(db, resolveLayers(db).find((l) => l.id === 'waste')!, { color: '#000000' });
		const [w] = applyLayers([c], resolveLayers(db), 'kiosk');
		expect([w.color, eventColor(w), eventIcon(w)]).toEqual([undefined, '#facc15', '🗑 ']);
	});

	it('dashboard: kiosk bez ukrytych, telefon osobno; święta wyłączone razem z warstwą', () => {
		const db = db0();
		db.insert(localEvents).values({ id: 'e1', title: 'Dentysta', start: '2026-11-13', end: '2026-11-14', allDay: true, memberId: 'mama' }).run();
		const kiosk = () => buildDashboard(db, NOW, 'kiosk');
		expect(kiosk().events.some((e) => e.id === 'e1')).toBe(true);
		expect(kiosk().calendars.list.map((l) => l.id)).toContain('local');
		setHiddenToday(db, 'local', true, TODAY);
		expect(kiosk().events.some((e) => e.id === 'e1')).toBe(false);
		expect(kiosk().calendars.list.find((l) => l.id === 'local')?.hiddenToday).toBe(true);
		expect(buildDashboard(db, NOW, 'phone').events.some((e) => e.id === 'e1')).toBe(true);

		expect(kiosk().publicHolidays).toBe(true);
		upsertLayer(db, resolveLayers(db).find((l) => l.id === 'holidays')!, { showKiosk: false });
		expect(kiosk().publicHolidays).toBe(false);
		expect(kiosk().calendars.hiddenInPanel).toBe(1);
	});

	it('telefon: wybór kalendarzy zapisany per osoba', () => {
		const db = db0();
		setPhoneHidden(db, 'ola', ['waste', 'nie-ma']);
		expect(phoneHidden(db, 'ola')).toEqual(['waste']);
		expect(phoneHidden(db, 'kuba')).toEqual([]);
		expect(phoneHidden(db, null)).toEqual([]);
		expect(() => setPhoneHidden(db, 'obcy', [])).toThrow();
	});
});

describe('parser iCal: szczegóły dla subskrypcji i importu', () => {
	it('koniec z DTEND / DURATION / domyślny, strefa TZID, miejsce', () => {
		const ev = parseIcal(CLUB, { details: true, horizon: '2027-12-31' });
		const t1 = ev.find((e) => e.uid === 't1')!;
		expect([t1.start, t1.end, t1.tzid, t1.location]).toEqual(['2026-11-14T10:00:00', '2026-11-14T11:30:00', 'Europe/Berlin', 'Hala, boisko 2']);
		expect(ev.find((e) => e.uid === 'm1')?.end).toBe('2026-11-23');
		expect(ev.filter((e) => e.uid.startsWith('w1|')).map((e) => e.end)).toEqual(['2026-11-16T17:45:00Z', '2026-11-23T17:45:00Z', '2026-11-30T17:45:00Z']);
		expect(ev.find((e) => e.uid === 'old')?.end).toBe('2026-01-02');
		// Bez `details` – ten sam kształt co dotąd (kalendarz śmieci).
		expect(Object.keys(parseIcal(CLUB)[0]).sort()).toEqual(['allDay', 'start', 'summary', 'uid']);
	});

	it('strefy: IANA, Outlook (Windows), Mozilla, pływający czas = strefa regionu', () => {
		expect(ianaZone('W. Europe Standard Time')).toBe('Europe/Berlin');
		expect(ianaZone('/mozilla.org/20050126_1/Europe/Warsaw')).toBe('Europe/Warsaw');
		expect(ianaZone('Nie/Ma')).toBeNull();
		expect(icalInstant('2026-11-14T10:00:00', 'Europe/Berlin')).toBe('2026-11-14T09:00:00.000Z');
		expect(icalInstant('2026-07-14T10:00:00', 'Europe/London')).toBe('2026-07-14T09:00:00.000Z');
		expect(icalInstant('2026-11-14T10:00:00', null)).toBe('2026-11-14T09:00:00.000Z');
		expect(icalInstant('2026-11-14T10:00:00Z', 'Europe/Berlin')).toBe('2026-11-14T10:00:00.000Z');
		const quoted = cal(vevent('UID:q', 'DTSTART;TZID="(UTC+01:00) Amsterdam, Berlin":20261114T100000', 'SUMMARY:Cytat'));
		expect(parseIcal(quoted, { details: true })[0].start).toBe('2026-11-14T10:00:00');
	});

	it('okno subskrypcji: od wczoraj do +60 dni, minione pominięte', () => {
		const ev = icalEventsBetween(CLUB, 'ical:k', '2026-11-11', '2027-01-11');
		expect(ev.map((e) => e.title)).toEqual(['Trening', 'Turniej', 'Basen', 'Basen', 'Basen']);
		expect(ev[0]).toMatchObject({ id: 'ical:k|t1', start: '2026-11-14T09:00:00.000Z', end: '2026-11-14T10:30:00.000Z', calendarId: 'ical:k', location: 'Hala, boisko 2' });
	});
});

describe('subskrypcja: bezpieczne pobieranie i odświeżanie', () => {
	it('adres: webcal → https, tylko http(s), bez loginu w adresie', () => {
		expect(normalizeIcalUrl(' webcal://p01-calendars.icloud.com/x.ics ').href).toBe('https://p01-calendars.icloud.com/x.ics');
		for (const bad of ['ftp://a/b.ics', 'file:///etc/passwd', 'kalendarz', 'https://u:p@a.example/x.ics']) expect(() => normalizeIcalUrl(bad)).toThrow();
	});

	it('SSRF: adresy prywatne, pętla, link-local, CGNAT i IPv6 lokalne zablokowane', async () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '100.100.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
			expect(isPrivateAddress(ip), ip).toBe(true);
		for (const ip of ['8.8.8.8', '17.253.144.10', '2a00:1450:4001::1', '172.32.0.1']) expect(isPrivateAddress(ip), ip).toBe(false);
		const lookup = async (h: string) => (h === 'evil.example' ? ['93.184.216.34', '10.0.0.5'] : ['93.184.216.34']);
		await expect(assertPublicHost(new URL('https://evil.example/a.ics'), lookup, {})).rejects.toThrow();
		await expect(assertPublicHost(new URL('http://localhost:8080/a.ics'), lookup, {})).rejects.toThrow();
		await expect(assertPublicHost(new URL('http://[::1]/a.ics'), lookup, {})).rejects.toThrow();
		await expect(assertPublicHost(new URL('https://ok.example/a.ics'), lookup, {})).resolves.toBeUndefined();
		await expect(assertPublicHost(new URL('http://192.168.1.5/a.ics'), lookup, { ICAL_ALLOW_PRIVATE: '1' })).resolves.toBeUndefined();
	});

	it('przekierowanie sprawdzane na każdym skoku; strona HTML i 404 – czytelny błąd', async () => {
		const checked: string[] = [];
		const check = async (u: URL) => {
			checked.push(u.host);
			if (u.hostname === 'internal.example') throw new Error('prywatny');
		};
		const f = fakeFetch({
			'https://a.example/k.ics': () => new Response(null, { status: 302, headers: { location: 'https://b.example/k.ics' } }),
			'https://b.example/k.ics': ics(CLUB),
			'https://a.example/evil.ics': () => new Response(null, { status: 301, headers: { location: 'http://internal.example/admin' } }),
			'https://a.example/page': () => new Response('<!doctype html><html>Kalendarz klubu</html>')
		});
		expect(await fetchIcalText(f as typeof fetch, 'https://a.example/k.ics', check)).toContain('BEGIN:VCALENDAR');
		expect(checked).toEqual(['a.example', 'b.example']);
		await expect(fetchIcalText(f as typeof fetch, 'https://a.example/evil.ics', check)).rejects.toThrow('prywatny');
		await expect(fetchIcalText(f as typeof fetch, 'https://a.example/page', check)).rejects.toThrow(/strony/);
		await expect(fetchIcalText(f as typeof fetch, 'https://a.example/brak.ics', check)).rejects.toThrow(/404/);
	});

	it('odświeżenie: wydarzenia w pamięci podręcznej, na kiosku z kolorem kalendarza; błąd zostawia ostatnie dane', async () => {
		const db = db0();
		const id = createSubscription(db, { name: 'Klub', url: 'https://klub.example/k.ics', color: '#ea580c', icon: '⚽', memberId: 'kuba', refreshMinutes: 60 });
		let body = CLUB;
		const f = fakeFetch({ 'https://klub.example/k.ics': () => new Response(body) });
		// Test: bez DNS (fakeFetch) – sprawdzenie adresu omija `ICAL_ALLOW_PRIVATE`.
		process.env.ICAL_ALLOW_PRIVATE = '1';
		try {
			const src = subscriptionSource({ id, url: 'https://klub.example/k.ics', refreshMinutes: 60 });
			expect(src.intervalMs).toBe(3_600_000);
			expect(await refresh(db, src, f as typeof fetch, NOW)).toBe(true);
			expect(readCache<CalEvent[]>(db, id).data?.length).toBe(5);
			const d = buildDashboard(db, NOW);
			const trening = d.events.find((e) => e.title === 'Trening')!;
			expect([trening.calendarId, trening.color, trening.icon, trening.memberId]).toEqual([id, '#ea580c', '⚽', 'kuba']);

			body = '<html>maintenance</html>';
			expect(await refresh(db, src, f as typeof fetch, new Date(NOW.getTime() + 3_600_000))).toBe(false);
			const c = readCache<CalEvent[]>(db, id);
			expect([c.status.ok, c.data?.length]).toEqual([false, 5]);
			expect(c.status.error).toMatch(/strony/);
		} finally {
			delete process.env.ICAL_ALLOW_PRIVATE;
		}
		deleteLayer(db, id);
		expect(readCache(db, id).data).toBeNull();
		expect(resolveLayers(db).some((l) => l.id === id)).toBe(false);
	});
});

describe('import pliku .ics', () => {
	it('od dziś, bez duplikatów UID; drugi import aktualizuje', () => {
		const db = db0();
		const r = readIcs(CLUB, TODAY);
		expect([r.rows.length, r.past, r.recurring]).toEqual([5, 1, 1]);
		const id = createLocalCalendar(db, { name: 'Klub', color: null, icon: '', memberId: null });
		expect(writeImport(db, id, r.rows)).toEqual({ added: 5, updated: 0 });
		const moved = CLUB.replace('SUMMARY:Trening', 'SUMMARY:Trening (sala B)');
		expect(writeImport(db, id, readIcs(moved, TODAY).rows)).toEqual({ added: 0, updated: 5 });
		const rows = db.select().from(localEvents).all();
		expect(rows.length).toBe(5);
		expect(rows.find((e) => e.uid === 't1')?.title).toBe('Trening (sala B)');
		// Ten sam plik do innego kalendarza – osobne wpisy.
		expect(writeImport(db, 'local', r.rows)).toEqual({ added: 5, updated: 0 });
	});

	it('podgląd → import do nowego kalendarza; ile już jest w każdym kalendarzu', async () => {
		const db = db0();
		const file = new File([CLUB], 'klub.ics', { type: 'text/calendar' });
		const p = await previewIcs(db, file, TODAY);
		expect(p).toMatchObject({ fileName: 'klub.ics', suggestedName: 'Klub', total: 5, past: 1, recurring: 1, from: '2026-11-14', to: '2026-11-30', existing: { local: 0 } });
		const f = new FormData();
		for (const [k, v] of Object.entries({ token: p.token, target: 'new', name: 'Klub Kuby', color: '#16a34a', icon: '⚽', memberId: 'kuba' })) f.set(k, v);
		const res = importIcs(db, f, TODAY);
		expect([res.added, res.updated]).toEqual([5, 0]);
		expect(resolveLayers(db).find((l) => l.id === res.calendarId)).toMatchObject({ name: 'Klub Kuby', memberId: 'kuba', kind: 'local' });
		// Token jednorazowy.
		expect(() => importIcs(db, f, TODAY)).toThrow();
		const again = await previewIcs(db, file, TODAY);
		expect(again.existing[res.calendarId]).toBe(5);
	});

	it('plik bez przyszłych wydarzeń albo nie-kalendarz – błąd z wyjaśnieniem', async () => {
		const db = db0();
		await expect(previewIcs(db, new File([cal(vevent('UID:o', 'DTSTART;VALUE=DATE:20200101', 'SUMMARY:Dawno'))], 'a.ics'), TODAY)).rejects.toThrow(/minęły/);
		await expect(previewIcs(db, new File(['hello'], 'a.ics'), TODAY)).rejects.toThrow(/kalendarz/);
		await expect(previewIcs(db, null, TODAY)).rejects.toThrow();
	});
});
