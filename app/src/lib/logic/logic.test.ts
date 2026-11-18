import { afterEach, describe, expect, it } from 'vitest';
import { addDays, localParts, localTime, localZone, isoWeekday, setTimeZone } from './dates';
import { easterSunday, holidayOn, publicHolidays } from './holidays';
import { DEFAULT_REGION, getRegion, setRegion } from '#lib/region.js';
import { completionKey, openChores, occursOn, type ChoreDef } from './chores';
import { compileMatch, mergePickups, putOutKey, putOutTasks, ruleFor, WASTE_PRESETS, type Pickup } from './waste';
import { noteExpiry, phaseAt } from './schedule';

describe('daty', () => {
	it('dodaje dni przez granicę miesiąca i roku', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
	it('dzień tygodnia ISO', () => {
		expect(isoWeekday('2026-10-31')).toBe(6); // sobota
		expect(isoWeekday('2026-11-01')).toBe(7); // niedziela
	});
	it('czas Berlina zimą i latem', () => {
		expect(localTime('2026-01-15', 6).toISOString()).toBe('2026-01-15T05:00:00.000Z');
		expect(localTime('2026-07-15', 6).toISOString()).toBe('2026-07-15T04:00:00.000Z');
	});
	it('dzień zmiany czasu (25.10.2026, 3:00 → 2:00)', () => {
		expect(localTime('2026-10-25', 6).toISOString()).toBe('2026-10-25T05:00:00.000Z');
		expect(localTime('2026-10-24', 23).toISOString()).toBe('2026-10-24T21:00:00.000Z');
	});
	it('godzina podwójna i nieistniejąca', () => {
		// 25.10.2026 2:30 występuje dwa razy → późniejsza (czas zimowy); 29.03.2026 2:30 nie istnieje → wg czasu zimowego
		expect(localTime('2026-10-25', 2, 30).toISOString()).toBe('2026-10-25T01:30:00.000Z');
		expect(localTime('2026-03-29', 2, 30).toISOString()).toBe('2026-03-29T01:30:00.000Z');
		expect(localTime('2026-03-29', 3, 0).toISOString()).toBe('2026-03-29T01:00:00.000Z');
	});
});

describe('strefa czasowa z ustawień', () => {
	afterEach(() => setRegion(DEFAULT_REGION));

	it('domyślnie Europe/Berlin', () => {
		expect(localZone()).toBe('Europe/Berlin');
		expect(getRegion()).toEqual({ country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin' });
	});
	it('Europe/Warsaw: zima, lato i zmiany czasu', () => {
		setRegion({ country: 'PL', subdivision: 'PL-MZ', timezone: 'Europe/Warsaw' });
		expect(localZone()).toBe('Europe/Warsaw');
		expect(localTime('2026-01-15', 6).toISOString()).toBe('2026-01-15T05:00:00.000Z');
		expect(localTime('2026-07-15', 6).toISOString()).toBe('2026-07-15T04:00:00.000Z');
		expect(localTime('2026-03-29', 6).toISOString()).toBe('2026-03-29T04:00:00.000Z');
		expect(localTime('2026-10-25', 6).toISOString()).toBe('2026-10-25T05:00:00.000Z');
		expect(localParts(new Date('2026-10-31T23:30:00Z'))).toEqual({ date: '2026-11-01', minutes: 30 });
	});
	it('każda strefa IANA, np. Londyn i Nowy Jork', () => {
		setTimeZone('Europe/London');
		expect(localTime('2026-01-15', 6).toISOString()).toBe('2026-01-15T06:00:00.000Z');
		expect(localTime('2026-07-15', 6).toISOString()).toBe('2026-07-15T05:00:00.000Z');
		expect(localTime('2026-11-01', 6, 0, 'America/New_York').toISOString()).toBe('2026-11-01T11:00:00.000Z');
		expect(localParts(new Date('2026-07-01T23:30:00Z')).date).toBe('2026-07-02');
	});
	it('nieznana strefa jest odrzucana', () => {
		expect(() => setTimeZone('Europe/Atlantis')).toThrow();
		expect(localZone()).toBe('Europe/Berlin');
	});
});

describe('święta ustawowe', () => {
	it('Wielkanoc', () => {
		expect(easterSunday(2026)).toBe('2026-04-05');
		expect(easterSunday(2027)).toBe('2027-03-28');
		expect(easterSunday(2025)).toBe('2025-04-20');
	});
	it('Dolna Saksonia (domyślnie): dni ruchome 2026', () => {
		const dates = publicHolidays(2026).map((h) => h.date);
		expect(dates).toContain('2026-04-03'); // Wielki Piątek
		expect(dates).toContain('2026-04-06'); // Poniedziałek Wielkanocny
		expect(dates).toContain('2026-05-14'); // Wniebowstąpienie
		expect(dates).toContain('2026-05-25'); // Zielone Świątki
		expect(dates).toHaveLength(10);
	});
	it('Dolna Saksonia: Święto Reformacji tak, Boże Ciało i Wszystkich Świętych nie', () => {
		expect(holidayOn('2026-10-31')?.name).toBe('Święto Reformacji');
		expect(holidayOn('2026-11-01')).toBeUndefined();
		expect(holidayOn('2026-06-04')).toBeUndefined();
	});
	it('Bawaria inaczej niż Dolna Saksonia', () => {
		const by = { country: 'DE', subdivision: 'DE-BY' } as const;
		expect(holidayOn('2026-01-06', by)?.name).toBe('Święto Trzech Króli');
		expect(holidayOn('2026-06-04', by)?.name).toBe('Boże Ciało');
		expect(holidayOn('2026-11-01', by)?.name).toBe('Wszystkich Świętych');
		expect(holidayOn('2026-10-31', by)).toBeUndefined();
		expect(publicHolidays(2026, by)).toHaveLength(12);
	});
	it('landy: Saksonia, Berlin, Turyngia, Brandenburgia', () => {
		expect(holidayOn('2026-11-18', { country: 'DE', subdivision: 'DE-SN' })?.name).toBe('Dzień Pokuty i Modlitwy');
		expect(holidayOn('2026-03-08', { country: 'DE', subdivision: 'DE-BE' })?.name).toBe('Dzień Kobiet');
		expect(holidayOn('2026-09-20', { country: 'DE', subdivision: 'DE-TH' })?.name).toBe('Dzień Dziecka');
		expect(holidayOn('2026-04-05', { country: 'DE', subdivision: 'DE-BB' })?.name).toBe('Wielkanoc');
	});
	it('nazwy po niemiecku (na później: interfejs w innym języku)', () => {
		expect(holidayOn('2026-10-31', { country: 'DE', subdivision: 'DE-NI' }, 'de')?.name).toBe('Reformationstag');
		expect(holidayOn('2026-06-04', { country: 'PL', subdivision: 'PL-MZ' }, 'de')?.name).toBe('Fronleichnam');
	});
	it('Polska 2025: 14 dni, w tym Wigilia', () => {
		const pl = { country: 'PL', subdivision: 'PL-MZ' } as const;
		const days = publicHolidays(2025, pl);
		expect(days).toHaveLength(14);
		expect(holidayOn('2025-12-24', pl)?.name).toBe('Wigilia');
		expect(holidayOn('2025-06-19', pl)?.name).toBe('Boże Ciało');
		expect(holidayOn('2025-06-08', pl)?.name).toBe('Zielone Świątki');
		expect(holidayOn('2025-05-03', pl)?.name).toBe('Święto Konstytucji 3 Maja');
		expect(holidayOn('2025-08-15', pl)?.name).toBe('Wniebowzięcie NMP');
		expect(holidayOn('2025-11-11', pl)?.name).toBe('Święto Niepodległości');
		expect(holidayOn('2025-04-18', pl)).toBeUndefined(); // Wielki Piątek nie jest wolny w PL
	});
	it('Polska: Wigilia dopiero od 2025, Boże Ciało 2026', () => {
		const pl = { country: 'PL', subdivision: 'PL-DS' } as const;
		expect(holidayOn('2024-12-24', pl)).toBeUndefined();
		expect(holidayOn('2026-12-24', pl)?.name).toBe('Wigilia');
		expect(holidayOn('2026-06-04', pl)?.name).toBe('Boże Ciało');
	});
	it('region z ustawień zmienia święta', () => {
		setRegion({ country: 'PL', subdivision: 'PL-MA', timezone: 'Europe/Warsaw' });
		try {
			expect(holidayOn('2026-11-11')?.name).toBe('Święto Niepodległości');
			expect(holidayOn('2026-10-31')).toBeUndefined();
		} finally {
			setRegion(DEFAULT_REGION);
		}
	});
});

describe('zadania domowe', () => {
	const chore = (id: number, recurrence: ChoreDef['recurrence'], startDate = '2026-01-01'): ChoreDef => ({
		id,
		title: `z${id}`,
		memberId: null,
		recurrence,
		startDate
	});

	it('miesięczne 31. w krótkim miesiącu wypada ostatniego dnia', () => {
		const r = { type: 'monthly', day: 31 } as const;
		expect(occursOn(r, '2026-01-01', '2026-02-28')).toBe(true);
		expect(occursOn(r, '2026-01-01', '2026-04-30')).toBe(true);
		expect(occursOn(r, '2026-01-01', '2026-03-30')).toBe(false);
	});

	it('pokazuje dzisiejsze i zaległe, ale tylko najnowsze wystąpienie', () => {
		const defs = [chore(1, { type: 'weekly', days: [7] }), chore(2, { type: 'daily' })];
		const open = openChores(defs, new Set(), '2026-11-03'); // wtorek
		expect(open).toEqual([
			{ choreId: 1, title: 'z1', memberId: null, dueDate: '2026-11-01', overdue: true },
			{ choreId: 2, title: 'z2', memberId: null, dueDate: '2026-11-03', overdue: false }
		]);
	});

	it('odhaczone znika', () => {
		const defs = [chore(2, { type: 'daily' })];
		expect(openChores(defs, new Set([completionKey(2, '2026-11-03')]), '2026-11-03')).toEqual([]);
	});

	it('jednorazowe w przyszłości jeszcze niewidoczne, zaległe widoczne', () => {
		const future = chore(3, { type: 'once', date: '2026-11-10' });
		const past = chore(4, { type: 'once', date: '2026-10-01' });
		const open = openChores([future, past], new Set(), '2026-11-03');
		expect(open.map((o) => o.choreId)).toEqual([4]);
	});

	it('nic przed datą startu', () => {
		expect(openChores([chore(5, { type: 'daily' }, '2026-11-05')], new Set(), '2026-11-03')).toEqual([]);
	});
});

describe('śmieci', () => {
	const bin = (title: string, country: 'DE' | 'PL') => ruleFor(title, WASTE_PRESETS[country])?.bin;

	it('zestaw DE rozpoznaje pojemniki z tytułów', () => {
		expect(bin('Gelber Sack / Gelbe Tonne', 'DE')).toBe('gelb');
		expect(bin('Restabfall 14-tägig', 'DE')).toBe('rest');
		expect(bin('Altpapier', 'DE')).toBe('papier');
		expect(bin('Bioabfall', 'DE')).toBe('bio');
		expect(bin('Altglas', 'DE')).toBe('glas');
		expect(bin('Weihnachtsbaum', 'DE')).toBeUndefined();
	});
	it('zestaw PL rozpoznaje pojemniki z tytułów', () => {
		expect(bin('Odpady zmieszane', 'PL')).toBe('zmieszane');
		expect(bin('Metale i tworzywa sztuczne', 'PL')).toBe('metale');
		expect(bin('SZKŁO', 'PL')).toBe('szklo');
		expect(bin('Szkło', 'PL')).toBe('szklo');
		expect(bin('Papier i tektura', 'PL')).toBe('papier');
		expect(bin('Bioodpady', 'PL')).toBe('bio');
		expect(bin('Odpady wielkogabarytowe', 'PL')).toBe('gabaryty');
		expect(bin('Popiół', 'PL')).toBe('popiol');
		expect(bin('Elektrośmieci', 'PL')).toBeUndefined();
	});
	it('kolory PL wg segregacji: papier niebieski, metale żółty, szkło zielony, bio brązowy', () => {
		const color = (b: string) => WASTE_PRESETS.PL.find((r) => r.bin === b)?.color;
		expect([color('papier'), color('metale'), color('szklo'), color('bio')]).toEqual(['#1d4ed8', '#f5c400', '#22a447', '#6b4423']);
	});
	it('dopasowanie: fragmenty po przecinku albo wyrażenie regularne', () => {
		expect(compileMatch('rest, schwarz')('Schwarze Tonne')).toBe(true);
		expect(compileMatch('/^abfuhr rest(müll|abfall)/')('Abfuhr Restabfall')).toBe(true);
		expect(compileMatch('/^abfuhr rest(müll|abfall)/')('Restabfall')).toBe(false);
		expect(() => compileMatch('/(/')).toThrow();
		expect(ruleFor('cokolwiek', [{ match: '/(/', bin: 'x', label: 'X', color: '#000000' }])).toBeUndefined();
	});
	it('scala terminy z iCal i ręczne, etykiety i kolory z aktualnych reguł', () => {
		const rules = WASTE_PRESETS.PL;
		const merged = mergePickups(
			[{ date: '2026-11-03', kind: 'papier', label: 'stara nazwa', color: '#000000' }],
			[
				{ date: '2026-11-03', bin: 'papier' },
				{ date: '2026-11-02', bin: 'szklo' },
				{ date: '2026-11-05', bin: 'nieznany' }
			],
			rules
		);
		expect(merged).toEqual([
			{ date: '2026-11-02', kind: 'szklo', label: 'Szkło', color: '#22a447' },
			{ date: '2026-11-03', kind: 'papier', label: 'Papier', color: '#1d4ed8' }
		]);
	});

	const pickups: Pickup[] = [
		{ date: '2026-11-01', kind: 'gelb', label: 'Gelbe Tonne', color: '#f5c400' },
		{ date: '2026-11-04', kind: 'papier', label: 'Papier', color: '#1d4ed8' }
	];

	it('zadanie dzień wcześniej', () => {
		const t = putOutTasks(pickups, new Set(), '2026-10-31', 14 * 60);
		expect(t.map((x) => x.kind)).toEqual(['gelb']);
		expect(t[0].color).toBe('#f5c400');
	});
	it('w dniu wywozu widoczne do 9:00', () => {
		expect(putOutTasks(pickups, new Set(), '2026-11-01', 8 * 60)).toHaveLength(1);
		expect(putOutTasks(pickups, new Set(), '2026-11-01', 9 * 60)).toHaveLength(0);
	});
	it('odhaczone znika', () => {
		expect(putOutTasks(pickups, new Set([putOutKey(pickups[0])]), '2026-10-31', 600)).toHaveLength(0);
	});
});

describe('ekran: dzień / wieczór / noc', () => {
	const at = (iso: string) => new Date(iso);
	it('fazy zimą (UTC+1)', () => {
		expect(phaseAt(at('2026-12-01T13:00:00Z'))).toBe('day'); // 14:00
		expect(phaseAt(at('2026-12-01T20:30:00Z'))).toBe('evening'); // 21:30
		expect(phaseAt(at('2026-12-01T22:00:00Z'))).toBe('night'); // 23:00
		expect(phaseAt(at('2026-12-02T04:59:00Z'))).toBe('night'); // 05:59
		expect(phaseAt(at('2026-12-02T05:00:00Z'))).toBe('day'); // 06:00
	});
	it('fazy latem (UTC+2)', () => {
		expect(phaseAt(at('2026-07-01T19:30:00Z'))).toBe('evening'); // 21:30
		expect(phaseAt(at('2026-07-01T21:00:00Z'))).toBe('night'); // 23:00
	});
});

describe('kartki', () => {
	it('czas wiszenia', () => {
		const created = new Date('2026-10-31T13:00:00Z'); // 14:00 w Berlinie
		expect(noteExpiry(created, 'evening').toISOString()).toBe('2026-10-31T22:00:00.000Z');
		expect(noteExpiry(created, 'tomorrow').toISOString()).toBe('2026-11-01T05:00:00.000Z');
		expect(noteExpiry(created, '3days').toISOString()).toBe('2026-11-03T05:00:00.000Z');
	});
	it('kartka dodana po północy w Berlinie liczy się od nowego dnia', () => {
		const created = new Date('2026-10-31T23:30:00Z'); // 00:30 1.11 w Berlinie
		expect(localParts(created).date).toBe('2026-11-01');
		expect(noteExpiry(created, 'tomorrow').toISOString()).toBe('2026-11-02T05:00:00.000Z');
	});
});

import { eventsOnDay } from './events';
import type { CalEvent } from '#lib/types.js';

describe('wydarzenia dnia', () => {
	const base = { title: 't', memberId: null, kind: 'event' } as const;
	const evs: CalEvent[] = [
		{ ...base, id: 'late', allDay: false, start: '2026-11-02T22:30:00Z', end: '2026-11-02T23:00:00Z' }, // 23:30 Berlin
		{ ...base, id: 'midnight', allDay: false, start: '2026-11-02T23:30:00Z', end: '2026-11-03T00:00:00Z' }, // 00:30 następnego dnia
		{ ...base, id: 'multi', allDay: true, start: '2026-11-01', end: '2026-11-04', kind: 'ferien' },
		{ ...base, id: 'bin', allDay: true, start: '2026-11-02', end: '2026-11-03', kind: 'waste' },
		{ ...base, id: 'early', allDay: false, start: '2026-11-02T07:00:00Z', end: '2026-11-02T08:00:00Z' }
	];
	it('układa i przypisuje do dnia wg czasu Berlina', () => {
		expect(eventsOnDay(evs, '2026-11-02').map((e) => e.id)).toEqual(['multi', 'bin', 'early', 'late']);
		expect(eventsOnDay(evs, '2026-11-03').map((e) => e.id)).toEqual(['multi', 'midnight']);
		expect(eventsOnDay(evs, '2026-11-04')).toEqual([]);
	});

	const timed = (id: string, start: string, end: string): CalEvent => ({ ...base, id, allDay: false, start, end });
	const parts = (list: CalEvent[], d: string) => eventsOnDay(list, d).map((e) => `${e.id}:${e.part ?? '-'}`);

	it('nocna zmiana 22:00–06:00: w obu dniach, drugi dzień jako „trwa” przed porannymi', () => {
		const night = timed('night', '2026-11-02T21:00:00Z', '2026-11-03T05:00:00Z'); // 22:00–06:00 Berlin
		const morning = timed('morning', '2026-11-03T06:00:00Z', '2026-11-03T07:00:00Z');
		expect(parts([night, morning], '2026-11-02')).toEqual(['night:first']);
		expect(parts([night, morning], '2026-11-03')).toEqual(['night:last', 'morning:-']);
		expect(parts([night], '2026-11-04')).toEqual([]);
	});

	it('kilka dni: środek „middle”, koniec o północy nie zajmuje kolejnego dnia', () => {
		const trip = timed('trip', '2026-11-05T15:00:00Z', '2026-11-08T23:00:00Z'); // pt 16:00 – pon 00:00 Berlin
		expect(parts([trip], '2026-11-05')).toEqual(['trip:first']);
		expect(parts([trip], '2026-11-06')).toEqual(['trip:middle']);
		expect(parts([trip], '2026-11-07')).toEqual(['trip:middle']);
		expect(parts([trip], '2026-11-08')).toEqual(['trip:last']);
		expect(parts([trip], '2026-11-09')).toEqual([]);
		// do północy – tylko jeden dzień; zerowa długość – dzień początku
		expect(parts([timed('eve', '2026-11-02T19:00:00Z', '2026-11-02T23:00:00Z')], '2026-11-03')).toEqual([]);
		expect(parts([timed('pt', '2026-11-02T19:00:00Z', '2026-11-02T19:00:00Z')], '2026-11-02')).toEqual(['pt:-']);
	});

	it('zmiana czasu (DST): noc z 24 na 25.10 i z 27 na 28.03 wg Berlina', () => {
		const autumn = timed('a', '2026-10-24T20:00:00Z', '2026-10-25T05:00:00Z'); // 22:00 CEST – 06:00 CET
		expect(parts([autumn], '2026-10-24')).toEqual(['a:first']);
		expect(parts([autumn], '2026-10-25')).toEqual(['a:last']);
		const spring = timed('s', '2027-03-27T21:00:00Z', '2027-03-28T04:00:00Z'); // 22:00 CET – 06:00 CEST
		expect(parts([spring], '2027-03-27')).toEqual(['s:first']);
		expect(parts([spring], '2027-03-28')).toEqual(['s:last']);
		// kończy się o północy 28.03 (23:00Z, jeszcze czas zimowy) – tylko 27.03
		expect(parts([timed('m', '2027-03-27T20:00:00Z', '2027-03-27T23:00:00Z')], '2027-03-28')).toEqual([]);
	});
});
