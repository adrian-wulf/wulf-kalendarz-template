import { describe, expect, it } from 'vitest';
import {
	birthdayParts,
	birthdaysBetween,
	genitivePl,
	genitivePlForms,
	isPhotoAvatar,
	nextBirthday,
	normalizeBirthday,
	possessive,
	upcomingBirthdays
} from './profiles';
import { celebratesNameDay, namedaysOn } from './namedays';
import { NAMEDAYS_PL } from './namedays-pl';

describe('urodziny', () => {
	it('zapis z rokiem i bez roku, złe daty odpadają', () => {
		expect(birthdayParts('2019-03-14')).toEqual({ year: 2019, month: 3, day: 14 });
		expect(birthdayParts('--02-29')).toEqual({ year: null, month: 2, day: 29 });
		expect(birthdayParts('2019-02-30')).toBeNull();
		expect(birthdayParts('14.03.2019')).toBeNull();
		expect(birthdayParts(null)).toBeNull();
		expect(normalizeBirthday('2019-03-14', false)).toBe('2019-03-14');
		expect(normalizeBirthday('2019-03-14', true)).toBe('--03-14');
		expect(normalizeBirthday('', false)).toBeNull();
		expect(normalizeBirthday('2019-13-01', false)).toBeUndefined();
	});

	it('odliczanie: dziś, za kilka dni, po nowym roku, wiek', () => {
		expect(nextBirthday('2019-11-12', '2026-11-12')).toEqual({ date: '2026-11-12', days: 0, age: 7 });
		expect(nextBirthday('2019-11-15', '2026-11-12')).toEqual({ date: '2026-11-15', days: 3, age: 7 });
		expect(nextBirthday('--01-02', '2026-12-30')).toEqual({ date: '2027-01-02', days: 3, age: null });
		// wczoraj były – następne za rok
		expect(nextBirthday('1980-11-11', '2026-11-12')?.date).toBe('2027-11-11');
	});

	it('29 lutego: w roku nieprzestępnym 28 lutego', () => {
		expect(nextBirthday('2020-02-29', '2027-02-01')).toEqual({ date: '2027-02-28', days: 27, age: 7 });
		expect(nextBirthday('2020-02-29', '2028-02-01')?.date).toBe('2028-02-29');
	});

	it('urodziny w zakresie (wydarzenia całodniowe), nie przed narodzinami', () => {
		expect(birthdaysBetween('2019-12-31', '2026-12-01', '2027-01-15')).toEqual([{ date: '2026-12-31', age: 7 }]);
		expect(birthdaysBetween('--01-02', '2026-12-01', '2027-01-15')).toEqual([{ date: '2027-01-02', age: null }]);
		expect(birthdaysBetween('2027-01-02', '2026-12-01', '2027-01-15')).toEqual([{ date: '2027-01-02', age: 0 }]);
		expect(birthdaysBetween('2028-01-02', '2026-12-01', '2027-01-15')).toEqual([]);
	});

	it('lista najbliższych urodzin w oknie odliczania', () => {
		const members = [
			{ id: 'ola', birthday: '2019-11-15' },
			{ id: 'kuba', birthday: '--11-12' },
			{ id: 'tata', birthday: '1985-12-24' },
			{ id: 'mama', birthday: null }
		];
		expect(upcomingBirthdays(members, '2026-11-12', 14).map((u) => [u.memberId, u.days])).toEqual([
			['kuba', 0],
			['ola', 3]
		]);
		expect(upcomingBirthdays(members, '2026-11-12', 60).map((u) => u.memberId)).toEqual(['kuba', 'ola', 'tata']);
	});

	it('awatar: zdjęcie albo emoji', () => {
		expect(isPhotoAvatar('/media/avatars/ola-1a2b.jpg')).toBe(true);
		expect(isPhotoAvatar('🦊')).toBe(false);
		expect(isPhotoAvatar(null)).toBe(false);
	});
});

describe('odmiana imienia', () => {
	it('dopełniacz typowych imion i zdrobnień', () => {
		const cases: [string, string][] = [
			['Ola', 'Oli'],
			['Ania', 'Ani'],
			['Kasia', 'Kasi'],
			['Babcia', 'Babci'],
			['Maria', 'Marii'],
			['Eugenia', 'Eugenii'],
			['Agnieszka', 'Agnieszki'],
			['Maja', 'Mai'],
			['Alicja', 'Alicji'],
			['Anna', 'Anny'],
			['Mama', 'Mamy'],
			['Tata', 'Taty'],
			['Kuba', 'Kuby'],
			['Marek', 'Marka'],
			['Wujek', 'Wujka'],
			['Paweł', 'Pawła'],
			['Jerzy', 'Jerzego'],
			['Antoni', 'Antoniego'],
			['Mieszko', 'Mieszka'],
			['Kacper', 'Kacpra'],
			['Aleksander', 'Aleksandra'],
			['Wawrzyniec', 'Wawrzyńca'],
			['Adam', 'Adama'],
			['Witold', 'Witolda']
		];
		expect(cases.map(([n]) => genitivePl(n))).toEqual(cases.map(([, g]) => g));
		expect(genitivePlForms('')).toEqual([]);
	});

	it('forma „czyje” w trzech językach', () => {
		expect(possessive('Ola', 'pl')).toBe('Oli');
		expect(possessive('Ola', 'de')).toBe('Olas');
		expect(possessive('Hans', 'de')).toBe('Hans’');
		expect(possessive('Ola', 'en')).toBe('Ola’s');
	});
});

describe('imieniny (PL)', () => {
	it('dane: każdy dzień roku z 29 lutego, niepuste imiona', () => {
		expect(Object.keys(NAMEDAYS_PL)).toHaveLength(366);
		expect(Object.values(NAMEDAYS_PL).every((l) => l.length >= 1 && l.every((n) => /^\p{Lu}\p{Ll}+$/u.test(n)))).toBe(true);
		expect(namedaysOn('2026-11-12')).toEqual(['Renaty', 'Witolda']);
		expect(namedaysOn('2026-12-24')).toContain('Ewy');
		expect(namedaysOn('2026-01-06')).toEqual(['Kacpra', 'Melchiora', 'Baltazara']);
	});

	it('kto dziś świętuje: mianownik z panelu vs dopełniacz z kalendarza', () => {
		expect(celebratesNameDay('Witold', namedaysOn('2026-11-12'))).toBe(true);
		expect(celebratesNameDay('Renata', namedaysOn('2026-11-12'))).toBe(true);
		expect(celebratesNameDay('witold', ['Witolda'])).toBe(true);
		expect(celebratesNameDay('Ewa', namedaysOn('2026-12-24'))).toBe(true);
		expect(celebratesNameDay('Kacper', namedaysOn('2026-01-06'))).toBe(true);
		expect(celebratesNameDay('Jerzy', namedaysOn('2026-04-23'))).toBe(true);
		expect(celebratesNameDay('Agnieszka', namedaysOn('2026-01-21'))).toBe(true);
		expect(celebratesNameDay('Ola', namedaysOn('2026-11-12'))).toBe(false);
		expect(celebratesNameDay('', ['Witolda'])).toBe(false);
		expect(celebratesNameDay(null, ['Witolda'])).toBe(false);
	});
});
