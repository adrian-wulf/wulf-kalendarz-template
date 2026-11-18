import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DICTS, LANGS, isKey } from '#lib/i18n/index.js';
import { GUIDES, SECTION_GUIDES, TIP_IDS, defaultVariant, parseInline } from './index.js';

describe('przewodniki w panelu', () => {
	it('każdy krok, tytuł i wariant ma tekst we wszystkich językach', () => {
		for (const g of Object.values(GUIDES)) {
			const keys = [g.title, g.intro, ...g.variants.flatMap((v) => [v.label, ...v.steps.map((s) => s.text)])];
			for (const k of keys) {
				expect(isKey(k), k).toBe(true);
				for (const l of LANGS) expect(typeof DICTS[l][k] === 'string' && (DICTS[l][k] as string).length > 0, `${l}: ${k}`).toBe(true);
			}
		}
	});

	it('pozycje listy i sprawdzenia mają teksty; każdy przewodnik ze sprawdzeniem ma „czego brak”', () => {
		for (const id of TIP_IDS) for (const part of ['title', 'desc']) expect(isKey(`tips.${id}.${part}`), `tips.${id}.${part}`).toBe(true);
		for (const g of Object.values(GUIDES)) if (g.tip) expect(isKey(`tips.${g.tip}.missing`), g.id).toBe(true);
		for (const id of ['google', 'bring', 'backup', 'ha', 'transit']) expect(isKey(`tips.${id}.started`), id).toBe(true);
	});

	it('kroki: jedna czynność – krótko (do 330 znaków), linki tylko https', () => {
		for (const l of LANGS)
			for (const g of Object.values(GUIDES))
				for (const v of g.variants)
					for (const s of v.steps) {
						const text = DICTS[l][s.text] as string;
						expect(text.length, `${l}: ${s.text}`).toBeLessThanOrEqual(330);
						expect(text, `${l}: ${s.text}`).not.toMatch(/\]\(http:/);
					}
	});

	it('zrzuty do kroków istnieją dla każdego języka (npm run screenshots)', () => {
		const shots = new Set(Object.values(GUIDES).flatMap((g) => g.variants.flatMap((v) => v.steps.map((s) => s.shot).filter(Boolean))));
		for (const s of shots) for (const l of LANGS) expect(existsSync(`static/guides/${s}-${l}.webp`), `${s}-${l}`).toBe(true);
	});

	it('sekcje panelu wskazują istniejące przewodniki', () => {
		for (const ids of Object.values(SECTION_GUIDES)) for (const id of ids) expect(GUIDES[id]).toBeDefined();
	});

	it('wariant domyślny: kraj z regionu, tryb logowania; drugi do wyboru', () => {
		expect(defaultVariant(GUIDES.waste, { country: 'PL', authMode: 'tailscale' }).id).toBe('PL');
		expect(defaultVariant(GUIDES.waste, { country: 'DE', authMode: 'tailscale' }).id).toBe('DE');
		expect(defaultVariant(GUIDES.phones, { country: 'DE', authMode: 'password' }).id).toBe('password');
		expect(defaultVariant(GUIDES.phones, { country: 'DE', authMode: 'proxy' }).id).toBe('tailscale');
		expect(defaultVariant(GUIDES.backup, { country: 'PL', authMode: 'tailscale' }).id).toBe('nextcloud');
	});

	it('zapis w tekstach: pogrubienie, kod, link https; reszta to zwykły tekst (bez HTML)', () => {
		expect(parseInline('Kliknij **Zapisz**, wpisz `http://192.168.1.20:8123` i otwórz [Google](https://console.cloud.google.com/).')).toEqual([
			{ kind: 'text', text: 'Kliknij ' },
			{ kind: 'bold', text: 'Zapisz' },
			{ kind: 'text', text: ', wpisz ' },
			{ kind: 'code', text: 'http://192.168.1.20:8123' },
			{ kind: 'text', text: ' i otwórz ' },
			{ kind: 'link', text: 'Google', href: 'https://console.cloud.google.com/' },
			{ kind: 'text', text: '.' }
		]);
		expect(parseInline('[zły](javascript:alert(1)) <b>x</b>')).toEqual([{ kind: 'text', text: '[zły](javascript:alert(1)) <b>x</b>' }]);
	});
});
