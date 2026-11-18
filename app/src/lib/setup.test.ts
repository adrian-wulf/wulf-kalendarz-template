import { describe, expect, it } from 'vitest';
import { MEMBER_PALETTE, clashesWithBins } from './colors';
import { binColors, WASTE_PRESETS } from './logic/waste';
import {
	STEPS,
	checkDemo,
	checkMembers,
	checkPlace,
	checkRegion,
	guessRegion,
	nextColor,
	nextStep,
	normalizeState,
	prevStep,
	toggleModule,
	usablePalette
} from './setup';
import { isValidTimeZone } from './logic/dates';

const PL_BINS = binColors(WASTE_PRESETS.PL);

describe('kreator: kroki i stan', () => {
	it('kolejność kroków, dalej/wstecz na krańcach', () => {
		expect(STEPS.map((s) => s.id)).toEqual(['lang', 'region', 'place', 'members', 'modules', 'theme', 'layout', 'data', 'summary']);
		expect(nextStep('lang')).toBe('region');
		expect(nextStep('summary')).toBe('summary');
		expect(prevStep('lang')).toBe('lang');
		expect(prevStep('members')).toBe('place');
	});

	it('stan z bazy: śmieci i nieznane kroki odpadają', () => {
		expect(normalizeState(null)).toEqual({ step: 'lang', saved: [] });
		expect(normalizeState({ step: 'nope', saved: ['lang', 'x', 'region'] })).toEqual({ step: 'lang', saved: ['lang', 'region'] });
		expect(normalizeState({ step: 'members', saved: 'lang' })).toEqual({ step: 'members', saved: [] });
	});
});

describe('kreator: region', () => {
	it('zgaduje kraj ze strefy przeglądarki', () => {
		expect(guessRegion('Europe/Warsaw')).toEqual({ country: 'PL', subdivision: 'PL-DS', timezone: 'Europe/Warsaw' });
		expect(guessRegion('Europe/Berlin').country).toBe('DE');
		// Strefa spoza Europy (np. komputer w podróży) – domyślna strefa kraju.
		expect(guessRegion('America/New_York').timezone).toBe('Europe/Warsaw');
		expect(guessRegion(undefined).country).toBe('PL');
	});

	it('sprawdza kraj, land/województwo i strefę', () => {
		expect(checkRegion({ country: 'DE', subdivision: 'DE-BY', timezone: 'Europe/Berlin' }, isValidTimeZone)).toEqual({
			country: 'DE',
			subdivision: 'DE-BY',
			timezone: 'Europe/Berlin'
		});
		expect(() => checkRegion({ country: 'FR' }, isValidTimeZone)).toThrow('Wybierz kraj');
		expect(() => checkRegion({ country: 'PL', subdivision: 'DE-BY' }, isValidTimeZone)).toThrow('województwo');
		expect(() => checkRegion({ country: 'DE', subdivision: '' }, isValidTimeZone)).toThrow('land');
		expect(() => checkRegion({ country: 'PL', subdivision: 'PL-MZ', timezone: 'Mars/Base' }, isValidTimeZone)).toThrow('strefę');
	});
});

describe('kreator: miejscowość', () => {
	it('przyjmuje współrzędne z przecinkiem i zaokrągla', () => {
		expect(checkPlace({ name: ' Kraków ', lat: '50,06143', lon: '19,93658' })).toEqual({ name: 'Kraków', lat: 50.0614, lon: 19.9366 });
		expect(checkPlace({ lat: 52.2, lon: 21 })).toEqual({ name: '', lat: 52.2, lon: 21 });
	});

	it('odrzuca brak i złe współrzędne', () => {
		expect(() => checkPlace({})).toThrow('Wybierz miejscowość');
		expect(() => checkPlace({ lat: 'abc', lon: '1' })).toThrow('Wybierz miejscowość');
		expect(() => checkPlace({ lat: '91', lon: '1' })).toThrow('Szerokość');
		expect(() => checkPlace({ lat: '1', lon: '-181' })).toThrow('Długość');
	});
});

describe('kreator: domownicy', () => {
	it('paleta bez kolorów pojemników, kolejny wolny kolor', () => {
		const palette = usablePalette(PL_BINS);
		expect(palette.length).toBeGreaterThan(4);
		expect(palette.every((c) => !clashesWithBins(c, PL_BINS))).toBe(true);
		expect(nextColor([], PL_BINS)).toBe(palette[0]);
		expect(nextColor([palette[0]], PL_BINS)).toBe(palette[1]);
		// Wszystkie zajęte – po kolei od początku, nadal bez kolizji.
		expect(palette).toContain(nextColor([...MEMBER_PALETTE, ...MEMBER_PALETTE], PL_BINS));
	});

	it('co najmniej jedna osoba, imię, unikalność, kolor', () => {
		expect(() => checkMembers([], PL_BINS)).toThrow('co najmniej jedną');
		expect(() => checkMembers('x', PL_BINS)).toThrow('co najmniej jedną');
		expect(() => checkMembers([{ name: ' ', color: '#0ea5e9' }], PL_BINS)).toThrow('imię');
		expect(() => checkMembers([{ name: 'A'.repeat(31), color: '#0ea5e9' }], PL_BINS)).toThrow('za długie');
		expect(() => checkMembers([{ name: 'Ola', color: '#0ea5e9' }, { name: 'ola', color: '#8b5cf6' }], PL_BINS)).toThrow('powtarza');
		expect(() => checkMembers([{ name: 'Ola', color: 'red' }], PL_BINS)).toThrow('zły kolor');
		expect(() => checkMembers(Array.from({ length: 13 }, (_, i) => ({ name: `O${i}`, color: '#0ea5e9' })), PL_BINS)).toThrow('12');
	});

	it('odrzuca kolor pojemnika, zachowuje id istniejących', () => {
		expect(() => checkMembers([{ name: 'Ola', color: PL_BINS[0] }], PL_BINS)).toThrow('pojemnika');
		expect(checkMembers([{ id: 'mama', name: ' Ewa ', color: '#E0457B' }, { name: 'Jan', color: '#8b5cf6', id: '' }], PL_BINS)).toEqual([
			{ id: 'mama', name: 'Ewa', color: '#e0457b' },
			{ name: 'Jan', color: '#8b5cf6' }
		]);
	});
});

describe('kreator: moduły i dane', () => {
	it('włączenie zapasów włącza zakupy, wyłączenie zakupów wyłącza zapasy', () => {
		const off = { shopping: false, pantry: false, snakes: true };
		expect(toggleModule(off, 'pantry', true)).toMatchObject({ pantry: true, shopping: true });
		expect(toggleModule({ shopping: true, pantry: true }, 'shopping', false)).toMatchObject({ shopping: false, pantry: false });
		expect(toggleModule({ shopping: true, pantry: true }, 'pantry', false)).toMatchObject({ shopping: true, pantry: false });
	});

	it('rdzeń i nieznane moduły bez zmian', () => {
		const s = { snakes: true };
		expect(toggleModule(s, 'calendar', false)).toBe(s);
		expect(toggleModule(s, 'nope', true)).toBe(s);
	});

	it('wybór danych przykładowych', () => {
		expect(checkDemo('empty')).toBe('empty');
		expect(checkDemo('example')).toBe('example');
		expect(() => checkDemo(null)).toThrow('Wybierz');
	});
});
