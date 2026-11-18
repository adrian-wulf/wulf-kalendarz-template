import { afterEach, describe, expect, it } from 'vitest';
import { recurringWindow } from './recurring';
import { careList, careView, careWhen, parseWindow, type CareItem } from './care';
import { doseInstant, dosesOn, doseState, history, kioskDoses, parseTimes, scheduledOn, type MedPlan } from './meds';
import { setTimeZone } from './dates';
import { setLang } from '#lib/i18n/index.js';

afterEach(() => {
	setTimeZone('Europe/Berlin');
	setLang('pl');
});

describe('okno „co X–Y dni” (wspólne: węże i opieka)', () => {
	it('stały odstęp: ok → soon (dzień przed) → due → overdue', () => {
		const w = { last: '2026-11-01', min: 7, max: 7 };
		expect(recurringWindow(w, '2026-11-05')).toEqual({ from: '2026-11-08', dueBy: '2026-11-08', state: 'ok' });
		expect(recurringWindow(w, '2026-11-07').state).toBe('soon');
		expect(recurringWindow(w, '2026-11-08').state).toBe('due');
		expect(recurringWindow(w, '2026-11-10').state).toBe('overdue');
	});

	it('okno od–do: przed oknem ok (bez „soon”), w oknie open, koniec okna due', () => {
		const w = { last: '2026-11-01', min: 7, max: 10 };
		expect(recurringWindow(w, '2026-11-07').state).toBe('ok');
		expect(recurringWindow(w, '2026-11-08')).toMatchObject({ from: '2026-11-08', dueBy: '2026-11-11', state: 'open' });
		expect(recurringWindow(w, '2026-11-10').state).toBe('open');
		expect(recurringWindow(w, '2026-11-11').state).toBe('due');
		expect(recurringWindow(w, '2026-11-12').state).toBe('overdue');
	});

	it('nigdy nie zrobione = due; wstrzymanie przesuwa okno', () => {
		expect(recurringWindow({ last: null, min: 3, max: 5 }, '2026-11-01')).toEqual({ from: null, dueBy: null, state: 'due' });
		const p = recurringWindow({ last: '2026-11-01', min: 3, max: 5, pauseUntil: '2026-11-20' }, '2026-11-10');
		expect(p).toEqual({ from: '2026-11-20', dueBy: '2026-11-20', state: 'paused' });
		expect(recurringWindow({ last: '2026-11-01', min: 3, max: 5, pauseUntil: '2026-11-20' }, '2026-11-20').state).toBe('due');
		// „max” mniejsze niż „min” traktujemy jak brak zakresu
		expect(recurringWindow({ last: '2026-11-01', min: 7, max: 3 }, '2026-11-08').state).toBe('due');
	});
});

describe('opieka', () => {
	const item = (id: number, name: string, minDays: number, maxDays: number): CareItem => ({ id, name, icon: '🪴', minDays, maxDays, memberId: null, pauseUntil: null });

	it('ostatnie wykonanie z historii, kolejność: po terminie, dziś, w oknie, reszta', () => {
		const items = [item(1, 'Fikus', 7, 7), item(2, 'Zioła', 2, 3), item(3, 'Filtr', 30, 30), item(4, 'Kaktus', 14, 21)];
		const logs = [
			{ id: 1, itemId: 1, date: '2026-11-01' },
			{ id: 2, itemId: 1, date: '2026-11-05' }, // ostatni wpis liczy się
			{ id: 3, itemId: 2, date: '2026-11-07' },
			{ id: 4, itemId: 3, date: '2026-10-10' },
			{ id: 5, itemId: 4, date: '2026-10-25' }
		];
		const list = careList(items, logs, '2026-11-12');
		expect(list.map((v) => [v.name, v.state])).toEqual([
			['Filtr', 'overdue'],
			['Zioła', 'overdue'],
			['Fikus', 'due'],
			['Kaktus', 'open']
		]);
		const fikus = list.find((v) => v.id === 1)!;
		expect(fikus).toMatchObject({ lastDone: '2026-11-05', lastLogId: 2, actionable: true });
	});

	it('opisy stanu', () => {
		const v = careView(item(1, 'Fikus', 7, 10), [{ id: 1, itemId: 1, date: '2026-11-01' }], '2026-11-09');
		expect(careWhen(v, '2026-11-09')).toBe('można · najpóźniej za 2 dni');
		expect(careWhen(careView(item(1, 'Fikus', 7, 7), [{ id: 1, itemId: 1, date: '2026-11-01' }], '2026-11-10'), '2026-11-10')).toBe('2 dni po terminie');
		expect(careWhen(careView(item(1, 'Fikus', 7, 7), [], '2026-11-10'), '2026-11-10')).toBe('jeszcze nie było');
		setLang('en');
		expect(careWhen(careView(item(1, 'Fikus', 7, 7), [{ id: 1, itemId: 1, date: '2026-11-01' }], '2026-11-04'), '2026-11-04')).toBe('in 4 days');
	});

	it('walidacja okna z formularza', () => {
		expect(parseWindow('7', '')).toEqual({ minDays: 7, maxDays: 7 });
		expect(parseWindow('7', '10')).toEqual({ minDays: 7, maxDays: 10 });
		expect(parseWindow('7', '5')).toBeNull();
		expect(parseWindow('0', '')).toBeNull();
		expect(parseWindow('2.5', '')).toBeNull();
	});
});

describe('leki: plan dawek', () => {
	const med = (o: Partial<MedPlan> = {}): MedPlan => ({ id: 1, memberId: 'mama', name: 'Witamina D', dose: '1 tabl.', times: ['08:00', '20:00'], days: [], startDate: null, endDate: null, active: true, ...o });

	it('dni tygodnia, zakres dat, wstrzymanie', () => {
		expect(scheduledOn(med(), '2026-11-12')).toBe(true);
		expect(scheduledOn(med({ days: [1, 3, 5] }), '2026-11-12')).toBe(false); // czwartek
		expect(scheduledOn(med({ days: [4] }), '2026-11-12')).toBe(true);
		expect(scheduledOn(med({ startDate: '2026-11-13' }), '2026-11-12')).toBe(false);
		expect(scheduledOn(med({ endDate: '2026-11-11' }), '2026-11-12')).toBe(false);
		expect(scheduledOn(med({ active: false }), '2026-11-12')).toBe(false);
	});

	it('stan dawki: przed porą, pora (od 30 min przed), zaległa (po 60 min), wzięta', () => {
		const at = new Date('2026-11-12T07:00:00Z'); // 08:00 w Berlinie
		expect(doseState(at, new Date('2026-11-12T06:20:00Z'), false)).toBe('upcoming');
		expect(doseState(at, new Date('2026-11-12T06:30:00Z'), false)).toBe('due');
		expect(doseState(at, new Date('2026-11-12T08:00:00Z'), false)).toBe('due');
		expect(doseState(at, new Date('2026-11-12T08:01:00Z'), false)).toBe('overdue');
		expect(doseState(at, new Date('2026-11-12T09:00:00Z'), true)).toBe('taken');
		expect(doseState(at, new Date('2026-11-12T06:50:00Z'), false, { lead: 5, grace: 10 })).toBe('upcoming');
	});

	it('zmiana czasu: „08:00” zostaje 8:00 lokalnie (wiosna i jesień), nieistniejąca 02:30 nie znika', () => {
		expect(doseInstant('2026-03-28', '08:00').toISOString()).toBe('2026-03-28T07:00:00.000Z'); // CET
		expect(doseInstant('2026-03-29', '08:00').toISOString()).toBe('2026-03-29T06:00:00.000Z'); // CEST od 29.03
		expect(doseInstant('2026-10-25', '08:00').toISOString()).toBe('2026-10-25T07:00:00.000Z'); // znów CET
		const gap = doseInstant('2026-03-29', '02:30');
		expect(gap.toISOString()).toBe('2026-03-29T01:30:00.000Z'); // 03:30 CEST – dawka nie przepada
		// Dawka o 8:00 w dniu zmiany czasu: o 6:30 UTC (8:30 CEST) jest „pora”, nie „przed porą”.
		const [morning] = dosesOn([med()], [], '2026-03-29', new Date('2026-03-29T06:30:00Z'));
		expect(morning).toMatchObject({ time: '08:00', state: 'due', at: '2026-03-29T06:00:00.000Z' });
		// Inna strefa (Polska ma tę samą zmianę, ale strefę ustawia region).
		setTimeZone('Europe/London');
		expect(doseInstant('2026-03-29', '08:00').toISOString()).toBe('2026-03-29T07:00:00.000Z');
	});

	it('dawki na kiosk: dzisiejsze + zaległa wieczorna z wczoraj; wzięte oznaczone', () => {
		const now = new Date('2026-11-12T07:10:00Z'); // 8:10
		const logs = [{ id: 5, medId: 1, date: '2026-11-12', time: '08:00', takenAt: '2026-11-12T07:05:00Z' }];
		const d = kioskDoses([med()], logs, '2026-11-12', now);
		expect(d.map((x) => [x.date, x.time, x.state])).toEqual([
			['2026-11-11', '20:00', 'overdue'],
			['2026-11-12', '08:00', 'taken'],
			['2026-11-12', '20:00', 'upcoming']
		]);
		expect(d[1]).toMatchObject({ logId: 5, takenAt: '2026-11-12T07:05:00Z' });
		// po południu wczorajsza już nie wisi
		expect(kioskDoses([med()], logs, '2026-11-12', new Date('2026-11-12T11:30:00Z')).map((x) => x.date)).toEqual(['2026-11-12', '2026-11-12']);
	});

	it('historia: wzięte z zaplanowanych w ostatnich dniach', () => {
		const logs = [
			{ id: 1, medId: 1, date: '2026-11-11', time: '08:00', takenAt: 'x' },
			{ id: 2, medId: 1, date: '2026-11-11', time: '20:00', takenAt: 'x' },
			{ id: 3, medId: 1, date: '2026-11-10', time: '08:00', takenAt: 'x' }
		];
		expect(history(med(), logs, '2026-11-12', 3)).toEqual([
			{ date: '2026-11-11', planned: 2, taken: 2 },
			{ date: '2026-11-10', planned: 2, taken: 1 },
			{ date: '2026-11-09', planned: 2, taken: 0 }
		]);
	});

	it('godziny z formularza', () => {
		expect(parseTimes('20:00, 8:00 8.00')).toEqual(['08:00', '20:00']);
		expect(parseTimes('25:00')).toBeNull();
		expect(parseTimes('')).toBeNull();
	});
});
