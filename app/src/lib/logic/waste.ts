import type { Country } from '#lib/region.js';
import { addDays } from './dates';

/**
 * Reguła „słowo w tytule wydarzenia iCal → pojemnik”. `match`: kilka fragmentów rozdzielonych
 * przecinkiem albo „|” (wielkość liter bez znaczenia) albo wyrażenie regularne w ukośnikach: `/rest(müll|abfall)/`.
 * Reguły sprawdzane są po kolei – wygrywa pierwsza pasująca. Kilka reguł może wskazywać ten sam `bin`.
 */
export interface WasteRule {
	match: string;
	/** identyfikator pojemnika (stały klucz zadań „wystaw”) */
	bin: string;
	label: string;
	color: string;
}

export interface Pickup {
	date: string;
	/** `bin` z reguły */
	kind: string;
	label: string;
	color: string;
}

/** Ręcznie wpisany termin wywozu (gdy gmina nie daje iCal). */
export interface ManualPickup {
	date: string;
	bin: string;
}

/**
 * Gotowe zestawy. Kolory według zwyczajowych kolorów pojemników w danym kraju.
 * Sprawdzone 11.2026 na prawdziwych kalendarzach: FES Frankfurt („Verpackung-Abholung”),
 * Stadtreinigung Leipzig („Blaue Tonne”, „Restabfalltonne”), MPGK Katowice („Odpady szklane…”,
 * „Odpady komunalne” = zmieszane). Kolory pojemników w nazwie (blau/braun/schwarz/grau) – tak jak
 * w większości gmin; tam, gdzie znaczą coś innego, reguły trzeba poprawić w panelu.
 */
export const WASTE_PRESETS: Record<Country, WasteRule[]> = {
	DE: [
		{ match: 'gelb, wertstoff, leichtverpack, lvp, verpackung', bin: 'gelb', label: 'Gelbe Tonne', color: '#f5c400' },
		{ match: 'bio, braun', bin: 'bio', label: 'Bio', color: '#6b4423' },
		{ match: 'papier, ppk, pappe, blau', bin: 'papier', label: 'Papier', color: '#1d4ed8' },
		{ match: 'rest, hausmüll, schwarz, grau', bin: 'rest', label: 'Restmüll', color: '#6b7280' },
		{ match: 'glas', bin: 'glas', label: 'Glas', color: '#22a447' }
	],
	PL: [
		{ match: 'metal, tworzyw, plastik', bin: 'metale', label: 'Metale i tworzywa', color: '#f5c400' },
		{ match: 'papier, makulatur', bin: 'papier', label: 'Papier', color: '#1d4ed8' },
		{ match: 'szkł, szkl', bin: 'szklo', label: 'Szkło', color: '#22a447' },
		{ match: 'bio, zielon, kuchenn', bin: 'bio', label: 'Bio', color: '#6b4423' },
		{ match: 'gabaryt, mebl', bin: 'gabaryty', label: 'Gabaryty', color: '#a8a29e' },
		{ match: 'popiół, popiol, żużel', bin: 'popiol', label: 'Popiół', color: '#d4d4d8' },
		{ match: 'zmieszan, resztkow, niesegreg, odpady komunalne', bin: 'zmieszane', label: 'Zmieszane', color: '#52525b' }
	]
};

/** Funkcja dopasowania dla `match`. Rzuca błąd przy niepoprawnym wyrażeniu regularnym. */
export function compileMatch(match: string): (summary: string) => boolean {
	const m = match.trim().match(/^\/(.+)\/$/);
	if (m) {
		const re = new RegExp(m[1], 'iu');
		return (s) => re.test(s);
	}
	const parts = match
		.split(/[,|]/)
		.map((p) => p.trim().toLowerCase())
		.filter(Boolean);
	return (s) => {
		const low = s.toLowerCase();
		return parts.some((p) => low.includes(p));
	};
}

const compiled = new WeakMap<WasteRule, (s: string) => boolean>();

/** Pierwsza reguła pasująca do tytułu (np. „Abfuhr Altpapier”, „Odpady zmieszane”). */
export function ruleFor(summary: string, rules: readonly WasteRule[]): WasteRule | undefined {
	return rules.find((r) => {
		let fn = compiled.get(r);
		if (!fn) {
			try {
				fn = compileMatch(r.match);
			} catch {
				fn = () => false;
			}
			compiled.set(r, fn);
		}
		return fn(summary);
	});
}

/** Kolory pojemników z reguł (unikalne) – zarezerwowane, domownicy nie mogą ich wybrać. */
export const binColors = (rules: readonly WasteRule[]) => [...new Set(rules.map((r) => r.color.toLowerCase()))];

/** Pierwsza reguła dla danego pojemnika (etykieta i kolor). */
export const binRule = (bin: string, rules: readonly WasteRule[]) => rules.find((r) => r.bin === bin);

/** Lista pojemników (bez powtórzeń) do wyboru w panelu. */
export const bins = (rules: readonly WasteRule[]) => rules.filter((r, i) => rules.findIndex((x) => x.bin === r.bin) === i);

/**
 * Terminy do pokazania: z iCal i wpisane ręcznie, z etykietą i kolorem wg aktualnych reguł
 * (zmiana koloru w panelu działa od razu), bez powtórzeń tego samego pojemnika w tym samym dniu.
 */
export function mergePickups(fromIcal: Pickup[], manual: ManualPickup[], rules: readonly WasteRule[]): Pickup[] {
	const out = new Map<string, Pickup>();
	const add = (date: string, kind: string, fallback?: Pickup) => {
		const r = binRule(kind, rules);
		if (!r && !fallback) return;
		out.set(`${date}:${kind}`, { date, kind, label: r?.label ?? fallback!.label, color: r?.color ?? fallback!.color });
	};
	for (const p of fromIcal) add(p.date, p.kind, { ...p, color: p.color ?? '#6b7280' });
	for (const m of manual) add(m.date, m.bin);
	return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export interface PutOutTask {
	key: string;
	kind: string;
	label: string;
	color: string;
	pickupDate: string;
}

/** Do kiedy (rano w dniu wywozu) zadanie „wystaw” jest jeszcze widoczne. */
const PICKUP_DAY_CUTOFF_MIN = 9 * 60;

/**
 * Zadania „wystawić pojemnik”: od dnia przed wywozem do rana w dniu wywozu,
 * o ile nie zostały odhaczone.
 */
export function putOutTasks(pickups: Pickup[], done: Set<string>, today: string, nowMinutes: number): PutOutTask[] {
	const tomorrow = addDays(today, 1);
	return pickups
		.filter((p) => p.date === tomorrow || (p.date === today && nowMinutes < PICKUP_DAY_CUTOFF_MIN))
		.map((p) => ({ key: putOutKey(p), kind: p.kind, label: p.label, color: p.color, pickupDate: p.date }))
		.filter((t) => !done.has(t.key));
}

export const putOutKey = (p: Pick<Pickup, 'date' | 'kind'>) => `waste:${p.date}:${p.kind}`;
