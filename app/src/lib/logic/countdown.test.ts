import { describe, expect, it } from 'vitest';
import { birthdayCountdowns, daysLeft, inYear, nextOccurrence, upcoming, withoutDuplicateBirthdays } from './countdown';

describe('odliczanie', () => {
	it('jednorazowe: do dnia włącznie, potem znika', () => {
		expect(nextOccurrence({ date: '2026-12-24', yearly: false }, '2026-11-12')).toBe('2026-12-24');
		expect(nextOccurrence({ date: '2026-11-12', yearly: false }, '2026-11-12')).toBe('2026-11-12');
		expect(nextOccurrence({ date: '2026-11-11', yearly: false }, '2026-11-12')).toBeNull();
	});

	it('co roku: w tym albo przyszłym roku, 29 lutego → 28 w zwykłym roku', () => {
		expect(nextOccurrence({ date: '2019-12-24', yearly: true }, '2026-11-12')).toBe('2026-12-24');
		expect(nextOccurrence({ date: '2019-03-01', yearly: true }, '2026-11-12')).toBe('2027-03-01');
		expect(nextOccurrence({ date: '2016-02-29', yearly: true }, '2027-01-10')).toBe('2027-02-28');
		expect(nextOccurrence({ date: '2016-02-29', yearly: true }, '2027-12-10')).toBe('2028-02-29');
		expect(inYear('2016-02-29', 2100)).toBe('2100-02-28');
	});

	it('kolejność i limit, liczba dni', () => {
		const list = [
			{ id: 1, title: 'Wigilia', emoji: '🎄', date: '2026-12-24', yearly: true, memberId: null },
			{ id: 2, title: 'Ferie', emoji: '⛷️', date: '2027-02-01', yearly: false, memberId: null },
			{ id: 3, title: 'Dziś', emoji: '🎉', date: '2026-11-12', yearly: false, memberId: null },
			{ id: 4, title: 'Stare', emoji: '🎉', date: '2026-01-01', yearly: false, memberId: null }
		];
		expect(upcoming(list, '2026-11-12').map((c) => [c.title, c.days])).toEqual([
			['Dziś', 0],
			['Wigilia', 42],
			['Ferie', 81]
		]);
		expect(upcoming(list, '2026-11-12', 2)).toHaveLength(2);
	});

	it('zmiana czasu: liczba dni idzie za datą w strefie, nie za 24 h', () => {
		const tz = 'Europe/Berlin';
		// 28 marca 2026, 23:30 czasu zimowego; noc z 28 na 29 ma tylko 23 godziny.
		expect(daysLeft('2026-03-30', new Date('2026-03-28T22:30:00Z'), tz)).toBe(2);
		// 29 marca 00:30 (już po północy lokalnie, jeszcze 28 w UTC)
		expect(daysLeft('2026-03-30', new Date('2026-03-28T23:30:00Z'), tz)).toBe(1);
		// 25 października: doba ma 25 godzin; 23:30 tego dnia to jeszcze 25.
		expect(daysLeft('2026-10-26', new Date('2026-10-25T22:30:00Z'), tz)).toBe(1);
		expect(daysLeft('2026-10-26', new Date('2026-10-25T23:30:00Z'), tz)).toBe(0);
		// Warszawa i Londyn: ta sama chwila, inny dzień
		expect(daysLeft('2026-12-24', new Date('2026-12-23T23:30:00Z'), 'Europe/Warsaw')).toBe(0);
		expect(daysLeft('2026-12-24', new Date('2026-12-23T23:30:00Z'), 'Europe/London')).toBe(1);
	});

	it('urodziny domowników z profilu (bez daty albo zła data – nic)', () => {
		const out = birthdayCountdowns(
			[
				{ id: 'ola', name: 'Ola', birthday: '2018-05-03' },
				{ id: 'kuba', name: 'Kuba', birthday: '--09-14' },
				{ id: 'tata', name: 'Tata' },
				{ id: 'mama', name: 'Mama', birthday: '2018-02-30' },
				{ id: 'leap', name: 'Leo', birthday: '--02-29' }
			],
			(n) => `Urodziny: ${n}`
		);
		expect(out.map((c) => [c.id, c.date, c.yearly, c.title])).toEqual([
			['bday:ola', '2018-05-03', true, 'Urodziny: Ola'],
			['bday:kuba', '2000-09-14', true, 'Urodziny: Kuba'],
			['bday:leap', '2000-02-29', true, 'Urodziny: Leo']
		]);
		expect(nextOccurrence(out[2], '2027-01-10')).toBe('2027-02-28');
		// Własne odliczanie tego samego domownika w ten sam dzień wygrywa z profilem.
		const own = [{ id: 1, title: 'Urodziny Oli', emoji: '🎂', date: '2018-05-03', yearly: true, memberId: 'ola' }];
		expect(withoutDuplicateBirthdays(own, out).map((c) => c.id)).toEqual(['bday:kuba', 'bday:leap']);
	});
});
