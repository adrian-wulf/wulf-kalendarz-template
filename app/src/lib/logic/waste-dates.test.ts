import { describe, expect, it } from 'vitest';
import { isRealDate, MAX_SERIES, nthInMonth, parseDateList, seriesDates, weekdayOf } from './waste-dates';

describe('wywozy na cały rok: seria', () => {
	it('co tydzień od pierwszego wywozu do końca zakresu, włącznie', () => {
		const d = seriesDates({ first: '2027-01-05', to: '2027-12-31', every: 1 });
		expect(d[0]).toBe('2027-01-05');
		expect(d[1]).toBe('2027-01-12');
		expect(d.at(-1)).toBe('2027-12-28');
		expect(d).toHaveLength(52);
		expect(d.every((x) => weekdayOf(x) === 2)).toBe(true); // wtorek
	});

	it('co 2 tygodnie przez zmianę czasu i koniec roku', () => {
		const d = seriesDates({ first: '2026-10-20', to: '2027-04-06', every: 2 });
		expect(d).toContain('2026-11-03'); // po zmianie czasu dalej wtorek
		expect(d).toContain('2026-12-29');
		expect(d).toContain('2027-01-12');
		expect(d.at(-1)).toBe('2027-04-06'); // ostatni dzień zakresu wliczony
		expect(new Set(d.map(weekdayOf))).toEqual(new Set([2]));
	});

	it('co 4 tygodnie i ostatni dzień zakresu', () => {
		expect(seriesDates({ first: '2027-01-07', to: '2027-03-04', every: 4 })).toEqual(['2027-01-07', '2027-02-04', '2027-03-04']);
	});

	it('raz w miesiącu: ten sam dzień tygodnia (np. 2. wtorek), 5. → ostatni', () => {
		expect(nthInMonth('2027-01-12')).toBe(2);
		expect(seriesDates({ first: '2027-01-12', to: '2027-04-30', every: 0 })).toEqual(['2027-01-12', '2027-02-09', '2027-03-09', '2027-04-13']);
		// 29.01.2027 to 5. piątek; w lutym nie ma 5. piątku → ostatni piątek
		expect(seriesDates({ first: '2027-01-29', to: '2027-03-31', every: 0 })).toEqual(['2027-01-29', '2027-02-26', '2027-03-26']);
	});

	it('złe dane → pusto, limit liczby terminów', () => {
		expect(seriesDates({ first: '2027-02-30', to: '2027-12-31', every: 1 })).toEqual([]);
		expect(seriesDates({ first: '2027-05-01', to: '2027-04-01', every: 1 })).toEqual([]);
		expect(seriesDates({ first: '2027-01-01', to: '2027-12-31', every: 7 })).toEqual([]);
		expect(seriesDates({ first: '2027-01-01', to: '2040-12-31', every: 1 })).toHaveLength(MAX_SERIES);
	});
});

describe('wywozy na cały rok: wklejone daty', () => {
	it('daty z kropkami, ukośnikami i ISO; bez roku – rok z parametru', () => {
		const r = parseDateList('12.01.2027, 26.01.\n9/02; 2027-02-23\n09.03.27', 2027);
		expect(r.dates).toEqual(['2027-01-12', '2027-01-26', '2027-02-09', '2027-02-23', '2027-03-09']);
		expect(r.bad).toEqual([]);
	});

	it('linie z miesiącem po polsku, niemiecku, angielsku i liczbą rzymską', () => {
		const r = parseDateList('Styczeń: 5, 19\nlutego 2 16\nMärz 2, 16, 30\nApril – 13 27\nIII: 31\nDecember 7', 2027);
		expect(r.dates).toEqual(['2027-01-05', '2027-01-19', '2027-02-02', '2027-02-16', '2027-03-02', '2027-03-16', '2027-03-30', '2027-03-31', '2027-04-13', '2027-04-27', '2027-12-07']);
		expect(r.bad).toEqual([]);
	});

	it('niepoprawne daty i linie bez dat trafiają do „bad”, powtórzenia znikają', () => {
		const r = parseDateList('31.02\nOdpady zmieszane\n12.01, 12.01.2027\nlistopad 31', 2027);
		expect(r.dates).toEqual(['2027-01-12']);
		expect(r.bad).toEqual(['31.02', 'Odpady zmieszane', '31 (listopad 31)']);
	});

	it('isRealDate', () => {
		expect(isRealDate('2028-02-29')).toBe(true);
		expect(isRealDate('2027-02-29')).toBe(false);
		expect(isRealDate('2027-1-5')).toBe(false);
	});
});
