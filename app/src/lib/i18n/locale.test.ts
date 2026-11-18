import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from './index';
import { dayHeader, eventTime, fmtDayMonth, fmtLongDate, fmtMonths, fmtRange, fmtShortDate, monthShort, weekdaysShort } from '../format';
import { KEYBOARD_LAYOUTS, nextLayout, upperKey } from '../keyboard';
import { holidayOn } from '../logic/holidays';
import { ageLabel, categoryOf, guessCategory } from '../logic/pantry';
import { iconFor, suggestProducts } from '../products';
import { setTimeZone } from '../logic/dates';

afterEach(() => setLang('pl'));

describe('daty wg języka (Intl, tydzień od poniedziałku)', () => {
	it('polski', () => {
		setTimeZone('Europe/Berlin');
		expect(weekdaysShort()).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
		expect(dayHeader('2026-11-15')).toEqual({ wd: 'Nd', day: 15, weekend: true });
		expect(fmtRange('2026-11-13', '2026-11-19')).toBe('13–19 listopada');
		expect(fmtRange('2026-11-28', '2026-12-04')).toBe('28 listopada – 4 grudnia');
		expect(fmtMonths('2026-11-02', '2026-12-06')).toBe('Listopad – grudzień');
		expect(fmtLongDate(new Date('2026-11-13T10:00:00Z'))).toBe('Piątek, 13 listopada');
		expect(fmtShortDate('2026-10-29')).toBe('29.10');
		expect(fmtDayMonth('2026-11-13')).toBe('13 listopada');
		expect(monthShort('2026-12-01')).toBe('gru');
	});

	it('niemiecki', () => {
		setLang('de');
		expect(weekdaysShort()).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
		expect(dayHeader('2026-11-16').wd).toBe('Mo');
		expect(fmtLongDate(new Date('2026-11-13T10:00:00Z'))).toBe('Freitag, 13. November');
		expect(fmtMonths('2026-11-02', '2026-12-06')).toBe('November – Dezember');
		expect(fmtShortDate('2026-10-29')).toBe('29.10.');
		expect(monthShort('2026-12-01')).toBe('Dez');
	});

	it('angielski (brytyjski)', () => {
		setLang('en');
		expect(weekdaysShort()[0]).toBe('Mon');
		expect(fmtLongDate(new Date('2026-11-13T10:00:00Z'))).toBe('Friday 13 November');
		expect(fmtRange('2026-11-28', '2026-12-04')).toBe('28 November – 4 December');
		expect(fmtShortDate('2026-10-29')).toBe('29/10');
	});
});

describe('klawiatura ekranowa', () => {
	it('układy: PL z polskimi znakami, DE QWERTZ z ä ö ü ß, EN QWERTY', () => {
		const flat = (id: 'pl' | 'de' | 'en') => [...KEYBOARD_LAYOUTS[id].rows.flat(), ...KEYBOARD_LAYOUTS[id].extra];
		expect(flat('pl')).toEqual(expect.arrayContaining(['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż']));
		expect(KEYBOARD_LAYOUTS.pl.rows[1].join('')).toBe('qwertyuiop');
		expect(KEYBOARD_LAYOUTS.de.rows[1].join('')).toBe('qwertzuiopü');
		expect(flat('de')).toEqual(expect.arrayContaining(['ä', 'ö', 'ü', 'ß']));
		expect(KEYBOARD_LAYOUTS.en.rows[1].join('')).toBe('qwertyuiop');
		expect(flat('en').some((k) => /[^\x00-\x7f⇧⌫]/.test(k))).toBe(false);
		for (const l of Object.values(KEYBOARD_LAYOUTS)) expect(l.rows.flat()).toEqual(expect.arrayContaining(['⇧', '⌫']));
	});

	it('przełączanie po kolei i wielkie litery', () => {
		expect([nextLayout('pl'), nextLayout('de'), nextLayout('en')]).toEqual(['de', 'en', 'pl']);
		expect([upperKey('ą'), upperKey('ß'), upperKey('⌫')]).toEqual(['Ą', 'ß', '⌫']);
	});
});

describe('dane zależne od języka', () => {
	it('święta po angielsku i niemiecku', () => {
		const pl = { country: 'PL', subdivision: 'PL-MZ' } as const;
		expect(holidayOn('2026-11-11', pl)?.name).toBe('Święto Niepodległości');
		setLang('en');
		expect(holidayOn('2026-11-11', pl)?.name).toBe('Independence Day');
		setLang('de');
		expect(holidayOn('2026-10-03', { country: 'DE', subdivision: 'DE-NI' })?.name).toBe('Tag der Deutschen Einheit');
	});

	it('kategorie zapasów: słowa ze wszystkich języków naraz', () => {
		expect(['Hähnchenbrust', 'Pizza Hawaii', 'Haferflocken', 'Spülmittel', 'Kaffee', 'Fischstäbchen'].map(guessCategory)).toEqual([
			'mieso',
			'gotowe',
			'sypkie',
			'chemia',
			'napoje',
			'gotowe'
		]);
		expect(['Chicken thighs', 'Frozen peas', 'Fish fingers', 'Toilet paper', 'Chocolate', 'Ice cream'].map(guessCategory)).toEqual([
			'mieso',
			'warzywa',
			'gotowe',
			'chemia',
			'slodycze',
			'slodycze'
		]);
		// polskie jak dawniej
		expect(['Pierogi ruskie', 'Pasta do zębów', 'Mleko UHT'].map(guessCategory)).toEqual(['gotowe', 'chemia', 'nabial']);
	});

	it('nazwy kategorii i wiek partii w bieżącym języku', () => {
		setLang('en');
		expect(categoryOf('nabial')[2]).toBe('Dairy');
		expect(ageLabel('2026-11-01', '2026-11-06')).toMatch(/5/);
		setLang('de');
		expect(categoryOf('napoje')[2]).toBe('Getränke');
	});

	it('podpowiedzi produktów w języku interfejsu, ikony we wszystkich', () => {
		expect(suggestProducts('mle')[0]).toEqual({ name: 'Mleko', icon: '🥛' });
		setLang('de');
		expect(suggestProducts('mil')[0]).toEqual({ name: 'Milch', icon: '🥛' });
		expect(suggestProducts('kase')[0].name).toBe('Käse');
		setLang('en');
		expect(suggestProducts('mil')[0]).toEqual({ name: 'Milk', icon: '🥛' });
		expect([iconFor('Mleko'), iconFor('Milch'), iconFor('milk'), iconFor('Brötchen')]).toEqual(['🥛', '🥛', '🥛', '🥖']);
	});
});

describe('godzina wydarzenia trwającego kilka dni', () => {
	const e = { allDay: false, start: '2026-11-02T21:00:00Z', end: '2026-11-03T05:00:00Z' };
	it('początek, środek i koniec w każdym języku', () => {
		expect(eventTime(e)).toBe('22:00');
		expect(eventTime({ ...e, part: 'first' })).toBe('22:00 →');
		expect(eventTime({ ...e, part: 'middle' })).toBe('cały dzień');
		expect(eventTime({ ...e, part: 'last' })).toBe('do 06:00');
		setLang('en');
		expect(eventTime({ ...e, part: 'last' })).toMatch(/^until 0?6:00/);
		setLang('de');
		expect(eventTime({ ...e, part: 'last' })).toBe('bis 06:00');
		expect(eventTime({ ...e, allDay: true })).toBeNull();
	});
});
