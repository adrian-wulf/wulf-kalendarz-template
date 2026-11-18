import { describe, expect, it } from 'vitest';
import { expandRrule, parseIcal } from './ical';
import { ferienTitle, schoolHolidaysSource, wasteSource, weatherSource, type Fetcher } from './index';
import { setLang } from '#lib/i18n/index.js';
import { openDb } from '../db/index';
import { readCache, refresh } from '../sync';
import { WASTE_PRESETS } from '#lib/logic/waste.js';
import { DEFAULT_REGION, setRegion } from '#lib/region.js';

const DE = WASTE_PRESETS.DE;
const PL = WASTE_PRESETS.PL;

const ICS = [
	'BEGIN:VCALENDAR',
	'BEGIN:VEVENT',
	'UID:a1',
	'DTSTART;VALUE=DATE:20261102',
	'SUMMARY:Gelber Sack / Gelbe',
	'  Tonne',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'DTSTART;VALUE=DATE:20261104',
	'SUMMARY:Altpapier\\, blau',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'DTSTART;VALUE=DATE:20261105',
	'SUMMARY:Schadstoffmobil',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'DTSTART:20261106T060000Z',
	'SUMMARY:Restabfall',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

const fake =
	(body: unknown, status = 200): Fetcher =>
	async () =>
		new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('iCal', () => {
	it('parsuje, łączy zawinięte linie i odkodowuje znaki', () => {
		const ev = parseIcal(ICS);
		expect(ev).toHaveLength(4);
		expect(ev[0]).toEqual({ uid: 'a1', summary: 'Gelber Sack / Gelbe Tonne', start: '2026-11-02', allDay: true });
		expect(ev[1].summary).toBe('Altpapier, blau');
		expect(ev[3]).toMatchObject({ start: '2026-11-06T06:00:00Z', allDay: false });
	});

	it('kalendarz wywozu pomija nie-pojemniki', async () => {
		const p = await wasteSource({ url: 'https://x.test/a.ics' }, DE).fetch(fake(ICS), new Date());
		expect(p.map((x) => `${x.date}:${x.kind}`)).toEqual(['2026-11-02:gelb', '2026-11-04:papier', '2026-11-06:rest']);
		expect(p[0]).toMatchObject({ label: 'Gelbe Tonne', color: '#f5c400' });
	});

	it('termin z godziną UTC trafia na dzień lokalny', () => {
		const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20261105T233000Z', 'SUMMARY:Szkło', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
		expect(pickupsFromIcal(ics, PL)[0]).toMatchObject({ date: '2026-11-06', kind: 'szklo' });
	});
});

describe('iCal: powtórzenia i odporność', () => {
	const cal = (...ev: string[][]) => ['BEGIN:VCALENDAR', ...ev.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
	const H = { horizon: '2027-12-31', warn: () => {} };

	it('RRULE: WEEKLY z INTERVAL i UNTIL, EXDATE, przeniesiony termin (RECURRENCE-ID)', () => {
		const ics = cal(
			['UID:rest', 'DTSTART;VALUE=DATE:20261103', 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231', 'EXDATE;VALUE=DATE:20261201', 'SUMMARY:Restabfall'],
			['UID:rest', 'RECURRENCE-ID;VALUE=DATE:20261229', 'DTSTART;VALUE=DATE:20261230', 'SUMMARY:Restabfall (verschoben)'],
			['UID:rest', 'RECURRENCE-ID;VALUE=DATE:20261117', 'DTSTART;VALUE=DATE:20261117', 'STATUS:CANCELLED', 'SUMMARY:Restabfall']
		);
		expect(parseIcal(ics, H).map((e) => e.start)).toEqual(['2026-11-03', '2026-12-15', '2026-12-30']);
		expect(pickupsFromIcal(ics, DE).map((p) => p.date)).toEqual(['2026-11-03', '2026-12-15', '2026-12-30']);
	});

	it('RRULE: COUNT, BYDAY w tygodniu i w miesiącu (1MO, -1FR), BYMONTHDAY, godzina UTC', () => {
		expect(expandRrule('FREQ=WEEKLY;BYDAY=TU,FR;COUNT=4', '2026-11-03', '2030-01-01')).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13']);
		expect(expandRrule('FREQ=MONTHLY;BYDAY=1MO;COUNT=3', '2026-11-02', '2030-01-01')).toEqual(['2026-11-02', '2026-12-07', '2027-01-04']);
		expect(expandRrule('FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270131T000000Z', '2026-11-27', '2030-01-01')).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
		expect(expandRrule('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', '2026-10-31', '2030-01-01')).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
		expect(expandRrule('FREQ=DAILY;INTERVAL=10', '2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-11', '2026-11-21']);
		expect(expandRrule('FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=2', '2026-01-02', '2027-12-31')).toEqual(['2026-01-02', '2026-07-02', '2027-01-02', '2027-07-02']);
		const ev = parseIcal(cal(['UID:g', 'DTSTART:20261105T050000Z', 'RRULE:FREQ=WEEKLY;COUNT=2', 'SUMMARY:Szkło']), H);
		expect(ev.map((e) => e.start)).toEqual(['2026-11-05T05:00:00Z', '2026-11-12T05:00:00Z']);
		// reguła bez końca – tylko do horyzontu
		expect(parseIcal(cal(['UID:x', 'DTSTART;VALUE=DATE:20261101', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Bio']), { ...H, horizon: '2026-11-30' })).toHaveLength(5);
	});

	it('zły VEVENT jest pomijany z ostrzeżeniem, spacje na końcu linii i VALARM nie przeszkadzają', () => {
		const warn: string[] = [];
		const ics = cal(
			['UID:bad', 'DTSTART:2026-11-05', 'SUMMARY:Papier'],
			['UID:rr', 'DTSTART;VALUE=DATE:20261105', 'RRULE:FREQ=SECONDLY', 'SUMMARY:Papier'],
			['UID:ok', 'DTSTART;VALUE=DATE:20261106 ', 'SUMMARY:Altpapier', 'BEGIN:VALARM', 'ACTION:EMAIL', 'SUMMARY:Erinnerung', 'TRIGGER:-PT12H', 'END:VALARM']
		).replace('BEGIN:VEVENT', 'BEGIN:VEVENT  ');
		const ev = parseIcal(ics, { ...H, warn: (m) => warn.push(m) });
		expect(ev).toEqual([{ uid: 'ok', summary: 'Altpapier', start: '2026-11-06', allDay: true }]);
		expect(warn).toHaveLength(2);
		expect(warn[0]).toContain('2026-11-05');
	});
});

describe('źródła JSON', () => {
	it('pogoda Open-Meteo', async () => {
		const w = await weatherSource(52.37, 9.74).fetch(
			fake({
				current: { temperature_2m: 8.9, weather_code: 3 },
				daily: { time: ['2026-10-31'], weather_code: [61], temperature_2m_max: [10.2], temperature_2m_min: [4.1] }
			}),
			new Date()
		);
		expect(w).toEqual({ now: { temp: 8.9, code: 3 }, days: [{ date: '2026-10-31', code: 61, max: 10.2, min: 4.1 }] });
	});

	it('pogoda w strefie z ustawień', async () => {
		let url = '';
		const spy: Fetcher = async (u) => {
			url = String(u);
			return new Response(JSON.stringify({ current: { temperature_2m: 0, weather_code: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }));
		};
		setRegion({ country: 'PL', subdivision: 'PL-MZ', timezone: 'Europe/Warsaw' });
		try {
			await weatherSource(52.23, 21.01).fetch(spy, new Date());
		} finally {
			setRegion(DEFAULT_REGION);
		}
		expect(url).toContain('timezone=Europe%2FWarsaw');
	});

	it('ferie PL: kraj, województwo i polskie nazwy', async () => {
		let url = '';
		const spy: Fetcher = async (u) => {
			url = String(u);
			return new Response(
				JSON.stringify([
					{ id: 'z', startDate: '2026-01-19', endDate: '2026-02-01', name: [{ language: 'PL', text: 'Ferie zimowe' }] },
					{ id: 'l', startDate: '2026-06-27', endDate: '2026-08-31', name: [{ language: 'PL', text: 'Ferie letnie' }] }
				])
			);
		};
		const ev = await schoolHolidaysSource({ country: 'PL', subdivision: 'PL-MZ' }).fetch(spy, new Date('2026-10-31T12:00:00Z'));
		expect(url).toContain('countryIsoCode=PL&subdivisionCode=PL-MZ&languageIsoCode=PL');
		expect(ev.map((e) => [e.title, e.start, e.end])).toEqual([
			['Ferie zimowe', '2026-01-19', '2026-02-02'],
			['Ferie letnie', '2026-06-27', '2026-09-01']
		]);
	});

	it('ferie: dzień końcowy włącznie → koniec wyłączny', async () => {
		const ev = await schoolHolidaysSource().fetch(
			fake([{ id: 'x', startDate: '2026-12-23', endDate: '2027-01-09', name: [{ text: 'Weihnachtsferien' }] }]),
			new Date('2026-10-31T12:00:00Z')
		);
		// W pamięci zostaje nazwa z API, tłumaczenie przy wyświetlaniu.
		expect(ev[0]).toMatchObject({ title: 'Weihnachtsferien', start: '2026-12-23', end: '2027-01-10', kind: 'ferien', allDay: true });
		expect(ferienTitle('Weihnachtsferien')).toBe('Ferie świąteczne');
		expect(ferienTitle('Ferie letnie')).toBe('Wakacje');
		setLang('de');
		expect(ferienTitle('Weihnachtsferien')).toBe('Weihnachtsferien');
		expect(ferienTitle('Ferie zimowe')).toBe('Winterferien');
		setLang('en');
		expect(ferienTitle('Sommerferien')).toBe('Summer holidays');
		expect(ferienTitle('Unbekannt')).toBe('Unbekannt');
		setLang('pl');
	});

	it('ferie: wszystkie nazwy z OpenHolidays DE 2026–2027 mają tłumaczenie', () => {
		// pełna lista nazw z /SchoolHolidays?countryIsoCode=DE (11.2026) + PL
		const names = ['Weihnachtsferien', 'Halbjahrespause', 'Winterferien', 'Halbjahresferien', 'Frühjahrsferien', 'Fastnachtsferien', 'Osterferien', 'Pfingstferien', 'Himmelfahrt', 'Tag nach Himmelfahrt', 'Zusätzlicher Ferientag', 'Unterrichtsfreier Tag', 'Schulfreier Tag', 'Variabler Ferientag', 'Sommerferien', 'Herbstferien', 'Reformationsfest', 'Buß- und Bettag', 'Gründonnerstag', 'Ferie zimowe', 'Wiosenna przerwa świąteczna', 'Ferie letnie', 'Zimowa przerwa świąteczna'];
		setLang('en');
		for (const n of names) expect(ferienTitle(n), n).not.toBe(n);
		setLang('pl');
		expect(ferienTitle('Tag nach Himmelfahrt')).toBe('Dzień wolny od szkoły');
		expect(ferienTitle('Fastnachtsferien')).toBe('Ferie karnawałowe');
		setLang('de');
		expect(ferienTitle('Tag nach Himmelfahrt')).toBe('Tag nach Himmelfahrt');
		setLang('pl');
	});
});

describe('synchronizacja', () => {
	it('zapisuje dane, a po błędzie zachowuje ostatnie dobre i zgłasza błąd', async () => {
		const db = openDb(':memory:');
		const src = weatherSource(0, 0);
		const good = fake({ current: { temperature_2m: 1, weather_code: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } });
		expect(await refresh(db, src, good, new Date('2026-10-31T10:00:00Z'))).toBe(true);
		expect(readCache(db, 'weather').status).toEqual({ ok: true, fetchedAt: '2026-10-31T10:00:00.000Z', error: undefined });

		expect(await refresh(db, src, fake('nope', 503), new Date('2026-10-31T11:00:00Z'))).toBe(false);
		const after = readCache<{ now: { temp: number } }>(db, 'weather');
		expect(after.data?.now.temp).toBe(1);
		expect(after.status.ok).toBe(false);
		expect(after.status.error).toContain('503');
	});
});

import { readFileSync } from 'node:fs';
import { pickupsFromIcal } from './index';

describe('przykładowy eksport Abfuhrkalender (dane syntetyczne)', () => {
	it('rozpoznaje wszystkie terminy, łącznie z przesuniętymi', () => {
		const p = pickupsFromIcal(readFileSync(new URL('./fixtures/abfuhr.ics', import.meta.url), 'utf8'), DE);
		expect(p).toHaveLength(12);
		expect(p[0]).toEqual({ date: '2026-11-06', kind: 'rest', label: 'Restmüll', color: '#6b7280' });
		const count = (k: string) => p.filter((x) => x.kind === k).length;
		expect([count('rest'), count('bio'), count('papier'), count('gelb')]).toEqual([4, 4, 2, 2]);
	});
});

describe('przykładowy harmonogram gminy PL (dane syntetyczne)', () => {
	const text = readFileSync(new URL('./fixtures/harmonogram-pl.ics', import.meta.url), 'utf8');

	it('zestaw PL rozpoznaje frakcje i pomija inne wydarzenia', () => {
		const p = pickupsFromIcal(text, PL);
		const count = (k: string) => p.filter((x) => x.kind === k).length;
		expect(p).toHaveLength(10);
		expect([count('zmieszane'), count('metale'), count('papier'), count('szklo'), count('bio'), count('gabaryty')]).toEqual([3, 2, 1, 1, 2, 1]);
		expect(p[0]).toEqual({ date: '2026-11-03', kind: 'zmieszane', label: 'Zmieszane', color: '#52525b' });
		expect(p.some((x) => x.date === '2026-11-20')).toBe(false); // PSZOK – nie pojemnik
	});

	it('ten sam pojemnik dwa razy tego samego dnia liczy się raz', () => {
		expect(pickupsFromIcal(text, PL).filter((x) => x.date === '2026-11-10')).toHaveLength(2);
	});

	it('zestaw DE nie rozpoznaje polskich nazw (poza bio i papierem)', () => {
		expect(new Set(pickupsFromIcal(text, DE).map((x) => x.kind))).toEqual(new Set(['bio', 'papier']));
	});
});

describe('tytuły z prawdziwych kalendarzy wywozu (11.2026)', () => {
	// FES Frankfurt, Stadtreinigung Leipzig (DE), MPGK Katowice (PL); daty i adres zmyślone
	const text = readFileSync(new URL('./fixtures/waste-real-titles.ics', import.meta.url), 'utf8');
	const kinds = (rules: typeof DE) => Object.fromEntries(pickupsFromIcal(text, rules).map((p) => [p.date, p.kind]));

	it('zestaw DE: Verpackung, Blaue Tonne, Restabfalltonne', () => {
		expect(kinds(DE)).toMatchObject({
			'2026-11-03': 'gelb',
			'2026-11-04': 'rest',
			'2026-11-05': 'papier',
			'2026-11-06': 'bio',
			'2026-11-09': 'gelb',
			'2026-11-10': 'rest',
			'2026-11-11': 'papier'
		});
	});

	it('zestaw PL: szklane, „Odpady komunalne” = zmieszane, długie zawinięte tytuły', () => {
		expect(kinds(PL)).toMatchObject({
			'2026-11-12': 'zmieszane',
			'2026-11-13': 'szklo',
			'2026-11-14': 'papier',
			'2026-11-16': 'metale',
			'2026-11-17': 'gabaryty'
		});
	});
});
