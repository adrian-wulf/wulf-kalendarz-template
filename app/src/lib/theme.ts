/**
 * Motywy: gotowe palety (dzień + wieczór), własne kolory i krój pisma.
 * Moduł wspólny dla serwera (wstrzykiwanie CSS) i panelu (podgląd).
 */
import { t, type TextKey } from './i18n/index.js';

export const TOKEN_KEYS = ['bg', 'card', 'fg', 'muted', 'line', 'event-bg', 'note', 'alert', 'accent'] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Tokens = Record<TokenKey, string> & { shadow: string };

/** Tokeny, które można zmienić w panelu. */
export const EDITABLE = [
	['bg', 'theme.token.bg'],
	['card', 'theme.token.card'],
	['fg', 'theme.token.fg'],
	['accent', 'theme.token.accent']
] as const satisfies readonly (readonly [TokenKey, TextKey])[];
export type EditableKey = (typeof EDITABLE)[number][0];

/** `font` – krój proponowany przy wyborze motywu w panelu (można zmienić). */
export type Preset = { id: string; name: string; desc: string; font: FontId; day: Tokens; evening: Tokens };

const SOFT = '0 1px 3px rgba(60, 40, 20, 0.08)';

export const PRESETS: Preset[] = [
	{
		id: 'papier',
		get name() {
			return t('theme.papier.name');
		},
		get desc() {
			return t('theme.papier.desc');
		},
		font: 'fraunces-inter',
		day: {
			bg: '#f4efe6',
			card: '#fffdf8',
			fg: '#2a2522',
			muted: '#6e6458',
			line: '#e9e1d4',
			'event-bg': '#f7f2ea',
			note: '#fff3b0',
			alert: '#b8352a',
			accent: '#2a2522',
			shadow: SOFT
		},
		evening: {
			bg: '#2b2621',
			card: '#36302a',
			fg: '#f1e9dc',
			muted: '#b9ac99',
			line: '#4a4239',
			'event-bg': '#403830',
			note: '#5a5030',
			alert: '#ff8f80',
			accent: '#f1e9dc',
			shadow: 'none'
		}
	},
	{
		id: 'noc',
		get name() {
			return t('theme.noc.name');
		},
		get desc() {
			return t('theme.noc.desc');
		},
		font: 'fraunces-inter',
		day: {
			bg: '#13171d',
			card: '#1c222a',
			fg: '#ebe7df',
			muted: '#a3a9b1',
			line: '#2d343e',
			'event-bg': '#242b34',
			note: '#4a4124',
			alert: '#ff8577',
			accent: '#d9b06a',
			shadow: 'none'
		},
		evening: {
			bg: '#0b0d10',
			card: '#14171b',
			fg: '#d6d0c4',
			muted: '#8f8c84',
			line: '#252a30',
			'event-bg': '#1b1f24',
			note: '#3a3320',
			alert: '#f07a6c',
			accent: '#c39a55',
			shadow: 'none'
		}
	},
	{
		id: 'kontrast',
		get name() {
			return t('theme.kontrast.name');
		},
		get desc() {
			return t('theme.kontrast.desc');
		},
		font: 'inter',
		day: {
			bg: '#ececec',
			card: '#ffffff',
			fg: '#000000',
			muted: '#3b3b3b',
			line: '#9a9a9a',
			'event-bg': '#f1f1f1',
			note: '#ffe14d',
			alert: '#a80000',
			accent: '#0038d1',
			shadow: 'none'
		},
		evening: {
			bg: '#000000',
			card: '#121212',
			fg: '#ffffff',
			muted: '#d2d2d2',
			line: '#6b6b6b',
			'event-bg': '#1f1f1f',
			note: '#3f3600',
			alert: '#ff7b7b',
			accent: '#ffd400',
			shadow: 'none'
		}
	},
	{
		id: 'drewno',
		get name() {
			return t('theme.drewno.name');
		},
		get desc() {
			return t('theme.drewno.desc');
		},
		font: 'fraunces-inter',
		day: {
			bg: '#dcc6a4',
			card: '#f7efe1',
			fg: '#2e2017',
			muted: '#5f4935',
			line: '#cfb791',
			'event-bg': '#efe3cf',
			note: '#f3d68f',
			alert: '#9e2b1a',
			accent: '#94471d',
			shadow: '0 1px 3px rgba(70, 40, 15, 0.12)'
		},
		evening: {
			bg: '#221811',
			card: '#2e2219',
			fg: '#f0e2cf',
			muted: '#bba287',
			line: '#463529',
			'event-bg': '#392a1f',
			note: '#58421f',
			alert: '#ff9478',
			accent: '#e3a56b',
			shadow: 'none'
		}
	},
	{
		id: 'fiord',
		get name() {
			return t('theme.fiord.name');
		},
		get desc() {
			return t('theme.fiord.desc');
		},
		font: 'inter',
		day: {
			bg: '#d9e3e8',
			card: '#f7fafb',
			fg: '#14232b',
			muted: '#435864',
			line: '#c8d5dc',
			'event-bg': '#eef3f4',
			note: '#e2edd6',
			alert: '#b0281f',
			accent: '#1c5a73',
			shadow: '0 1px 3px rgba(20, 40, 50, 0.08)'
		},
		evening: {
			bg: '#0e1a21',
			card: '#16252e',
			fg: '#dce7eb',
			muted: '#93aab5',
			line: '#253944',
			'event-bg': '#1c2e39',
			note: '#33432a',
			alert: '#ff8a80',
			accent: '#7fc0d4',
			shadow: 'none'
		}
	}
];

export const DEFAULT_PRESET = 'papier';

export const FONTS = {
	'fraunces-inter': { label: 'Fraunces + Inter', head: "'Fraunces Variable', Georgia, serif", body: "'Inter Variable', 'Noto Sans', sans-serif" },
	inter: { label: 'Inter', head: "'Inter Variable', 'Noto Sans', sans-serif", body: "'Inter Variable', 'Noto Sans', sans-serif" },
	system: {
		get label() {
			return t('theme.font.system');
		},
		head: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }
} as const;
export type FontId = keyof typeof FONTS;

export type ThemeSettings = {
	preset: string;
	/** Zmienione tokeny dnia. */
	overrides: Partial<Record<TokenKey, string>>;
	font: FontId;
	/** 'auto' – wieczór z motywu; inaczej własne tokeny wieczoru (na bazie wieczoru motywu). */
	evening: 'auto' | Partial<Record<TokenKey, string>>;
};

export const DEFAULT_THEME: ThemeSettings = { preset: DEFAULT_PRESET, overrides: {}, font: 'fraunces-inter', evening: 'auto' };

export type ResolvedTheme = { preset: string; font: FontId; day: Tokens; evening: Tokens };

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/** Odrzuca nieznane klucze i złe kolory – dane z bazy mogą być stare albo ręcznie zmienione. */
function cleanTokens(v: unknown): Partial<Record<TokenKey, string>> {
	const out: Partial<Record<TokenKey, string>> = {};
	if (!v || typeof v !== 'object') return out;
	for (const k of TOKEN_KEYS) {
		const c = (v as Record<string, unknown>)[k];
		if (isHex(c)) out[k] = c.toLowerCase();
	}
	return out;
}

/** Bezpieczne odczytanie ustawień motywu z dowolnej wartości (np. JSON z bazy). */
export function normalizeTheme(v: unknown): ThemeSettings {
	if (!v || typeof v !== 'object') return DEFAULT_THEME;
	const o = v as Record<string, unknown>;
	const preset = typeof o.preset === 'string' && presetById(o.preset) ? o.preset : DEFAULT_PRESET;
	const font = typeof o.font === 'string' && o.font in FONTS ? (o.font as FontId) : DEFAULT_THEME.font;
	return { preset, font, overrides: cleanTokens(o.overrides), evening: o.evening === 'auto' || o.evening == null ? 'auto' : cleanTokens(o.evening) };
}

export function resolveTheme(settings: ThemeSettings): ResolvedTheme {
	const s = normalizeTheme(settings);
	const p = presetById(s.preset)!;
	const day: Tokens = { ...p.day, ...s.overrides };
	let evening: Tokens = { ...p.evening };
	if (s.evening === 'auto') {
		// Własny akcent przechodzi na wieczór, jeśli jest tam czytelny; inaczej zostaje akcent motywu.
		const a = s.overrides.accent;
		if (a && contrast(a, evening.card) >= 3) evening.accent = a;
	} else evening = { ...evening, ...s.evening };
	return { preset: s.preset, font: s.font, day, evening };
}

const decl = (t: Tokens) => [...TOKEN_KEYS.map((k) => `--${k}:${t[k]}`), `--shadow:${t.shadow}`].join(';');

/**
 * CSS wstrzykiwany do <head>. Selektory `html:root` są mocniejsze niż `:root` z app.css,
 * więc kolejność arkuszy nie ma znaczenia; wieczór działa jak dotąd przez data-phase.
 */
export function themeCss(t: ResolvedTheme): string {
	const f = FONTS[t.font];
	const css =
		`html:root{${decl(t.day)};--font-head:${f.head};--font-body:${f.body}}` +
		`html:root[data-phase='evening'],html:root[data-phase='night']{${decl(t.evening)}}`;
	// Wartości są już sprawdzone, ale na wszelki wypadek nie pozwalamy zamknąć <style>.
	return css.replace(/</g, '\\3c ');
}

// --- Kontrast WCAG 2.x ---

function luminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

/** Pary, które muszą być czytelne: [tekst, tło, minimum]. */
export const CONTRAST_PAIRS: [TokenKey, TokenKey, number][] = [
	['fg', 'bg', 4.5],
	['fg', 'card', 4.5],
	['fg', 'event-bg', 4.5],
	['fg', 'note', 4.5],
	['muted', 'card', 4.5],
	['muted', 'bg', 4.5],
	['alert', 'card', 4.5],
	['accent', 'card', 3],
	['accent', 'event-bg', 3]
];

/** Pary nieczytelne w danym zestawie tokenów. */
export function contrastProblems(t: Tokens, pairs = CONTRAST_PAIRS) {
	return pairs.map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(t[fg], t[bg]) })).filter((p) => p.ratio < p.min);
}
