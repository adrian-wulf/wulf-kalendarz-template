import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, DEFAULT_THEME, PRESETS, TOKEN_KEYS, contrast, normalizeTheme, resolveTheme, themeCss } from './theme';
import { openDb } from './server/db/index';
import { getTheme, parseThemeForm, resetTheme, saveTheme, setTheme } from './server/theme';
import { InputError } from './server/store';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('kontrast WCAG', () => {
	it('wzór zgadza się z wartościami referencyjnymi', () => {
		expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrast('#ffffff', '#ffffff')).toBe(1);
		expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
	});

	for (const p of PRESETS)
		for (const phase of ['day', 'evening'] as const)
			it(`${p.name} (${phase === 'day' ? 'dzień' : 'wieczór'}): kluczowe pary są czytelne`, () => {
				const t = p[phase];
				for (const k of TOKEN_KEYS) expect(t[k], `${k}`).toMatch(/^#[0-9a-f]{6}$/);
				const failures = CONTRAST_PAIRS.map(([fg, bg, min]) => ({ pair: `${fg}/${bg}`, min, ratio: +contrast(t[fg], t[bg]).toFixed(2) })).filter((x) => x.ratio < x.min);
				expect(failures).toEqual([]);
			});

	it('motywy mają unikalne identyfikatory i różne tła', () => {
		expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
		expect(new Set(PRESETS.map((p) => p.day.bg)).size).toBe(PRESETS.length);
	});
});

describe('rozwiązywanie motywu', () => {
	it('domyślnie Papier, wieczór z motywu', () => {
		const r = resolveTheme(DEFAULT_THEME);
		expect(r.day).toEqual(PRESETS[0].day);
		expect(r.evening).toEqual(PRESETS[0].evening);
	});

	it('własne kolory nadpisują dzień; akcent przechodzi na wieczór tylko gdy czytelny', () => {
		const fiord = PRESETS.find((p) => p.id === 'fiord')!;
		const r = resolveTheme({ preset: 'fiord', font: 'inter', overrides: { bg: '#eeeeee', accent: '#e0a030' }, evening: 'auto' });
		expect(r.day).toMatchObject({ bg: '#eeeeee', accent: '#e0a030', fg: fiord.day.fg });
		expect(r.evening.bg).toBe(fiord.evening.bg);
		expect(r.evening.accent).toBe('#e0a030');
		const dark = resolveTheme({ preset: 'fiord', font: 'inter', overrides: { accent: '#1a1a1a' }, evening: 'auto' });
		expect(dark.evening.accent).toBe(fiord.evening.accent);
	});

	it('własny wieczór na bazie wieczoru motywu', () => {
		const r = resolveTheme({ preset: 'noc', font: 'system', overrides: {}, evening: { bg: '#000000' } });
		expect(r.evening).toMatchObject({ bg: '#000000', fg: PRESETS.find((p) => p.id === 'noc')!.evening.fg });
	});

	it('normalizacja odrzuca śmieci z bazy', () => {
		expect(normalizeTheme(null)).toEqual(DEFAULT_THEME);
		expect(normalizeTheme({ preset: 'nie-ma', font: 'comic', overrides: { bg: 'red', fg: '#ABCDEF', foo: '#000000' }, evening: { card: 'url(x)' } })).toEqual({
			preset: 'papier',
			font: 'fraunces-inter',
			overrides: { fg: '#abcdef' },
			evening: {}
		});
	});

	it('CSS: tokeny na :root, wieczór przez data-phase, krój pisma', () => {
		const css = themeCss(resolveTheme({ preset: 'kontrast', font: 'inter', overrides: {}, evening: 'auto' }));
		expect(css).toContain("html:root{--bg:#ececec;");
		expect(css).toContain("html:root[data-phase='evening'],html:root[data-phase='night']{--bg:#000000;");
		expect(css).toContain("--font-head:'Inter Variable'");
		expect(css).not.toContain('<');
	});
});

describe('zapis z panelu', () => {
	const base = { preset: 'drewno', font: 'fraunces-inter', eveningAuto: 'on' };

	it('zapamiętuje tylko kolory inne niż w motywie', () => {
		const drewno = PRESETS.find((p) => p.id === 'drewno')!;
		const t = parseThemeForm(form({ ...base, 'day-bg': drewno.day.bg, 'day-fg': drewno.day.fg, 'day-accent': '#7A3010' }));
		expect(t).toEqual({ preset: 'drewno', font: 'fraunces-inter', overrides: { accent: '#7a3010' }, evening: 'auto' });
	});

	it('odrzuca zły kolor, nieznany motyw i krój', () => {
		expect(() => parseThemeForm(form({ ...base, 'day-bg': 'red' }))).toThrow(InputError);
		expect(() => parseThemeForm(form({ ...base, 'day-bg': '#fff' }))).toThrow('Zły kolor: tło');
		expect(() => parseThemeForm(form({ ...base, 'day-fg': '#000000;}body{x' }))).toThrow(InputError);
		expect(() => parseThemeForm(form({ ...base, preset: 'neon' }))).toThrow('Nieznany motyw');
		expect(() => parseThemeForm(form({ ...base, font: 'comic' }))).toThrow('Nieznany krój pisma');
	});

	it('odrzuca nieczytelny tekst', () => {
		expect(() => parseThemeForm(form({ ...base, 'day-fg': '#c8b8a0' }))).toThrow(/Za słaby kontrast w dzień: tekst na tle – 1,\d:1, potrzeba co najmniej 4,5:1/);
		expect(() => parseThemeForm(form({ preset: 'noc', font: 'inter', 'evening-fg': '#303030' }))).toThrow(/wieczorem/);
	});

	it('zapis, odczyt i przywrócenie kolorów motywu', () => {
		const db = openDb(':memory:');
		expect(getTheme(db)).toEqual(DEFAULT_THEME);
		saveTheme(db, form({ preset: 'fiord', font: 'system', 'day-accent': '#0b4a60', 'evening-bg': '#000000' }));
		expect(getTheme(db)).toEqual({ preset: 'fiord', font: 'system', overrides: { accent: '#0b4a60' }, evening: { bg: '#000000' } });
		resetTheme(db);
		expect(getTheme(db)).toEqual({ preset: 'fiord', font: 'system', overrides: {}, evening: 'auto' });
		setTheme(db, { ...DEFAULT_THEME, preset: 'kontrast' });
		expect(getTheme(db).preset).toBe('kontrast');
	});
});
