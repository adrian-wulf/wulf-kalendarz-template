import type { TextKey } from '#lib/i18n/index.js';
import type { Country } from '#lib/region.js';

/**
 * Przewodniki „Jak to ustawić?” w panelu (26b): krótkie numerowane kroki – jedna czynność na krok –
 * z linkami, zrzutami z trybu demo i wariantami (np. Polska / Niemcy). Teksty są w słownikach
 * (`guide.<id>.<wariant>.<n>`), tu tylko kolejność, warianty i zrzuty. Czyta to przeglądarka i serwer.
 */

/** Pozycje listy „Co jeszcze możesz podłączyć” (przegląd panelu). */
export const TIP_IDS = ['google', 'calendars', 'waste', 'bring', 'birthdays', 'phones', 'backup', 'pin', 'transit', 'ha'] as const;
export type TipId = (typeof TIP_IDS)[number];
export const isTipId = (v: unknown): v is TipId => TIP_IDS.includes(v as TipId);

/** done – działa; started – zaczęte; todo – nic; unknown – nie da się sprawdzić automatycznie */
export type TipState = 'done' | 'started' | 'todo' | 'unknown';

export type GuideId = 'google' | 'bring' | 'waste' | 'transit' | 'ha' | 'backup' | 'phones' | 'kiosk' | 'region' | 'modules';

export interface GuideStep {
	text: TextKey;
	/** zrzut z trybu demo: `/guides/<shot>-<język>.webp` (npm run screenshots) */
	shot?: string;
}

export interface GuideVariant {
	id: string;
	label: TextKey;
	steps: GuideStep[];
}

export interface GuideDef {
	id: GuideId;
	title: TextKey;
	/** jedno zdanie: co to daje i ile to trwa */
	intro: TextKey;
	variants: GuideVariant[];
	/** domyślny wariant (kraj z regionu, tryb logowania); brak – pierwszy */
	pick?: (ctx: GuideContext) => string;
	/** stan z listy „Co jeszcze możesz podłączyć” – „✓ Gotowe – to działa” na końcu */
	tip?: TipId;
}

export interface GuideContext {
	country: Country;
	authMode: string;
}

/** Wartości wstawiane w teksty kroków ({redirectUri}, {phoneUrl}…). */
export type GuideParams = Record<string, string>;

/** `n` kolejnych kroków o kluczach `<prefix>.1…n` (klucze sprawdza TypeScript przez słownik). */
const steps = (prefix: string, n: number, shots: Record<number, string> = {}): GuideStep[] =>
	Array.from({ length: n }, (_, i) => ({ text: `${prefix}.${i + 1}` as TextKey, ...(shots[i + 1] ? { shot: shots[i + 1] } : {}) }));

const byCountry = (ctx: GuideContext) => ctx.country;

export const GUIDES: Record<GuideId, GuideDef> = {
	google: {
		id: 'google',
		title: 'guide.google.title',
		intro: 'guide.google.intro',
		variants: [{ id: 'all', label: 'guide.google.title', steps: steps('guide.google.all', 9) }],
		tip: 'google'
	},
	bring: {
		id: 'bring',
		title: 'guide.bring.title',
		intro: 'guide.bring.intro',
		variants: [{ id: 'all', label: 'guide.bring.title', steps: steps('guide.bring.all', 5) }],
		tip: 'bring'
	},
	waste: {
		id: 'waste',
		title: 'guide.waste.title',
		intro: 'guide.waste.intro',
		variants: [
			{ id: 'PL', label: 'region.PL', steps: steps('guide.waste.PL', 6, { 4: 'waste-year' }) },
			{ id: 'DE', label: 'region.DE', steps: steps('guide.waste.DE', 6) }
		],
		pick: byCountry,
		tip: 'waste'
	},
	transit: {
		id: 'transit',
		title: 'guide.transit.title',
		intro: 'guide.transit.intro',
		variants: [
			{ id: 'PL', label: 'region.PL', steps: steps('guide.transit.PL', 6, { 5: 'transit-stop' }) },
			{ id: 'DE', label: 'region.DE', steps: steps('guide.transit.DE', 5, { 3: 'transit-stop' }) }
		],
		pick: byCountry,
		tip: 'transit'
	},
	ha: {
		id: 'ha',
		title: 'guide.ha.title',
		intro: 'guide.ha.intro',
		variants: [{ id: 'all', label: 'guide.ha.title', steps: steps('guide.ha.all', 6, { 5: 'ha-entities' }) }],
		tip: 'ha'
	},
	backup: {
		id: 'backup',
		title: 'guide.backup.title',
		intro: 'guide.backup.intro',
		variants: [
			{ id: 'nextcloud', label: 'guide.backup.nextcloud', steps: steps('guide.backup.nextcloud', 6) },
			{ id: 'nas', label: 'guide.backup.nas', steps: steps('guide.backup.nas', 6) }
		],
		tip: 'backup'
	},
	phones: {
		id: 'phones',
		title: 'guide.phones.title',
		intro: 'guide.phones.intro',
		variants: [
			{ id: 'tailscale', label: 'guide.phones.tailscale', steps: steps('guide.phones.tailscale', 7, { 5: 'kiosk-qr', 7: 'phone-home' }) },
			{ id: 'password', label: 'guide.phones.password', steps: steps('guide.phones.password', 5, { 5: 'phone-home' }) }
		],
		pick: (ctx) => (ctx.authMode === 'password' ? 'password' : 'tailscale'),
		tip: 'phones'
	},
	kiosk: {
		id: 'kiosk',
		title: 'guide.kiosk.title',
		intro: 'guide.kiosk.intro',
		variants: [{ id: 'all', label: 'guide.kiosk.title', steps: steps('guide.kiosk.all', 6, { 2: 'kiosk-pin' }) }],
		tip: 'pin'
	},
	region: {
		id: 'region',
		title: 'guide.region.title',
		intro: 'guide.region.intro',
		variants: [{ id: 'all', label: 'guide.region.title', steps: steps('guide.region.all', 4) }]
	},
	modules: {
		id: 'modules',
		title: 'guide.modules.title',
		intro: 'guide.modules.intro',
		variants: [{ id: 'all', label: 'guide.modules.title', steps: steps('guide.modules.all', 4) }]
	}
};

/** Przewodniki w sekcjach panelu (slug → przewodniki nad treścią sekcji). */
export const SECTION_GUIDES: Record<string, GuideId[]> = {
	google: ['google'],
	zakupy: ['bring'],
	smieci: ['waste'],
	odjazdy: ['transit'],
	'home-assistant': ['ha'],
	kopie: ['backup'],
	dostep: ['phones', 'kiosk'],
	ekran: ['kiosk'],
	wygaszacz: ['kiosk'],
	region: ['region']
};

/** Domyślny wariant przewodnika dla tego domu. */
export function defaultVariant(g: GuideDef, ctx: GuideContext): GuideVariant {
	const id = g.pick?.(ctx);
	return g.variants.find((v) => v.id === id) ?? g.variants[0];
}

export type Inline = { kind: 'text' | 'bold' | 'code'; text: string } | { kind: 'link'; text: string; href: string };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;

/**
 * Prosty zapis w tekstach kroków: `**pogrubienie**` (nazwy przycisków), `` `kod` `` (adresy do wpisania)
 * i `[link](https://…)` – tylko https, otwierany w nowej karcie. Bez HTML z tłumaczeń.
 */
export function parseInline(s: string): Inline[] {
	const out: Inline[] = [];
	let last = 0;
	for (const m of s.matchAll(INLINE)) {
		if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
		if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
		else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] });
		else out.push({ kind: 'link', text: m[3], href: m[4] });
		last = m.index + m[0].length;
	}
	if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
	return out;
}
