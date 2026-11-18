import { describe, expect, it, afterEach } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { DICTS, LANGS, setLang, t, tn, translate, type Plural } from './index';
import { findHardcoded } from './hardcoded';

afterEach(() => setLang('pl'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const values = (v: string | Plural) => (typeof v === 'string' ? [v] : Object.values(v));

describe('słowniki', () => {
	const pl = DICTS.pl as Record<string, string | Plural>;

	for (const lang of LANGS) {
		const dict = DICTS[lang] as Record<string, string | Plural>;

		it(`${lang}: te same klucze co polski, bez pustych wartości`, () => {
			expect(Object.keys(dict).sort()).toEqual(Object.keys(pl).sort());
			const empty = Object.entries(dict).filter(([, v]) => values(v).some((s) => typeof s !== 'string' || !s.trim()));
			expect(empty.map(([k]) => k)).toEqual([]);
		});

		it(`${lang}: te same parametry {…} i rodzaj wpisu (tekst / liczba mnoga)`, () => {
			const bad = Object.keys(pl).filter((k) => {
				if (typeof pl[k] !== typeof dict[k]) return true;
				const want = placeholders(values(pl[k]).join(' '));
				return values(dict[k]).some((s) => placeholders(s).some((p) => !want.includes(p)));
			});
			expect(bad).toEqual([]);
		});

		it(`${lang}: formy liczby mnogiej wg reguł języka`, () => {
			const forms = lang === 'pl' ? ['few', 'many', 'one', 'other'] : ['one', 'other'];
			const bad = Object.entries(dict).filter(([, v]) => typeof v !== 'string' && JSON.stringify(Object.keys(v).sort()) !== JSON.stringify(forms));
			expect(bad.map(([k]) => k)).toEqual([]);
		});

		it(`${lang}: listy w jednym tekście mają tyle samo pozycji`, () => {
			const count = (k: string, sep: string) => (dict[k] as string).split(sep).filter((x) => x.trim()).length;
			expect(count('date.weekdaysShort', ',')).toBe(7);
			expect(count('date.weekdaysOn', ',')).toBe(7);
			expect(count('snakes.legend', '|')).toBe(5);
			for (const k of ['add.event.steps', 'add.note.steps', 'add.chore.steps']) expect(count(k, '|')).toBe(3);
		});
	}
});

describe('t() i tn()', () => {
	it('parametry i bieżący język', () => {
		expect(t('common.failed', { label: 'X' })).toBe('Nie udało się: X');
		setLang('de');
		expect(t('kiosk.shopping')).toBe('Einkauf');
		setLang('en');
		expect(t('kiosk.shopping')).toBe('Shopping');
		expect(translate('pl', 'kiosk.shopping')).toBe('Zakupy');
		setLang('xx');
		expect(t('kiosk.shopping')).toBe('Zakupy');
	});

	it('liczba mnoga: PL 1 / 2–4 / 5+ (także 12–14 i 22), DE i EN 1 / reszta', () => {
		const pl = [1, 2, 4, 5, 12, 22, 25].map((n) => tn('time.daysAgo', n));
		expect(pl).toEqual(['1 dzień temu', '2 dni temu', '4 dni temu', '5 dni temu', '12 dni temu', '22 dni temu', '25 dni temu']);
		expect(tn('pantry.age.days', 1)).toBe('od 1 dnia');
		expect(tn('pantry.age.days', 3)).toBe('od 3 dni');
		setLang('de');
		expect(tn('time.daysAgo', 1)).not.toBe(tn('time.daysAgo', 2));
		setLang('en');
		expect(tn('time.daysAgo', 1)).toBe('1 day ago');
		expect(tn('time.daysAgo', 5)).toBe('5 days ago');
	});
});

describe('teksty na sztywno w komponentach', () => {
	it('wykrywa polski tekst, pomija komentarze i style', () => {
		expect(findHardcoded('<p>Zapisz</p>').length).toBe(1);
		expect(findHardcoded('<p>Usuń wpis</p>').length).toBe(1);
		expect(findHardcoded("<p>{t('common.save')}</p>\n<!-- Zapisz -->\n<style>.a::after { content: '' }</style>")).toEqual([]);
		expect(findHardcoded('<script>\n\t// Zapisz, gdy gotowe\n\tconst x = 1;\n</script>')).toEqual([]);
	});

	it('żaden plik .svelte nie ma polskiego tekstu poza słownikiem', () => {
		const files = globSync('src/**/*.svelte');
		expect(files.length).toBeGreaterThan(40);
		const found = files.flatMap((f) => findHardcoded(readFileSync(f, 'utf8')).map(([n, line]) => `${f}:${n}: ${line}`));
		expect(found).toEqual([]);
	});

	it('w stylach nie ma tekstu do czytania (content: …)', () => {
		const found = globSync('src/**/*.{svelte,css}').flatMap((f) =>
			[...readFileSync(f, 'utf8').matchAll(/content:\s*(['"])([^'"]*)\1/g)].filter((m) => /\p{L}{2,}/u.test(m[2])).map((m) => `${f}: ${m[0]}`)
		);
		expect(found).toEqual([]);
	});
});
