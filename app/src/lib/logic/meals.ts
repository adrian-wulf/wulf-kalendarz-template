/**
 * Plan posiłków – czysta logika: pory posiłków, składniki zapisane tekstem i wyliczenie,
 * czego brakuje do zaplanowanych dań (z uwzględnieniem zapasów i listy zakupów).
 */
import type { Ingredient } from '#lib/server/db/schema.js';
import { addDays } from './dates.js';

export const MEAL_SLOTS = ['lunch', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type SlotSetting = 'lunch' | 'dinner' | 'both';

export const isSlot = (v: unknown): v is MealSlot => v === 'lunch' || v === 'dinner';

/** Pory posiłków z ustawienia modułu. */
export const slotsFor = (s: string): MealSlot[] => (s === 'both' ? [...MEAL_SLOTS] : s === 'dinner' ? ['dinner'] : ['lunch']);

/** Kolejne dni od `from` (włącznie). */
export const daysFrom = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

// --- Składniki ---

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Liczba z tekstu: „2”, „0,5”, „1.5”, „1/2”, „½”, „1½”. */
export function parseQty(s: string): number | null {
	const t = s.trim();
	const m = /^(\d+)?\s*([½¼¾⅓⅔])$/.exec(t);
	if (m) return (m[1] ? Number(m[1]) : 0) + FRACTIONS[m[2]];
	const f = /^(\d+)\/(\d+)$/.exec(t);
	if (f) return Number(f[2]) ? Number(f[1]) / Number(f[2]) : null;
	if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
	return null;
}

/** Jednostki rozpoznawane po liczbie (PL / DE / EN). Klucz małymi literami, bez kropki. */
const UNIT_ALIASES: Record<string, string> = {
	g: 'g',
	gr: 'g',
	gram: 'g',
	gramy: 'g',
	gramów: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l',
	szt: 'szt.',
	sztuki: 'szt.',
	sztuk: 'szt.',
	stk: 'Stk.',
	stück: 'Stk.',
	pcs: 'pcs',
	pc: 'pcs',
	x: 'szt.',
	łyżka: 'łyżka',
	łyżki: 'łyżka',
	łyżek: 'łyżka',
	łyżeczka: 'łyżeczka',
	łyżeczki: 'łyżeczka',
	el: 'EL',
	tl: 'TL',
	tbsp: 'tbsp',
	tsp: 'tsp',
	op: 'op.',
	opak: 'op.',
	opakowanie: 'op.',
	pck: 'Pck.',
	packung: 'Pck.',
	pack: 'pack',
	packs: 'pack',
	puszka: 'puszka',
	puszki: 'puszka',
	dose: 'Dose',
	dosen: 'Dose',
	can: 'can',
	cans: 'can',
	ząbek: 'ząbek',
	ząbki: 'ząbek',
	zehe: 'Zehe',
	zehen: 'Zehe',
	clove: 'clove',
	cloves: 'clove',
	szklanka: 'szklanka',
	szklanki: 'szklanka',
	cup: 'cup',
	cups: 'cup',
	tasse: 'Tasse',
	pęczek: 'pęczek',
	bund: 'Bund',
	bunch: 'bunch',
	plaster: 'plaster',
	plastry: 'plaster',
	scheibe: 'Scheibe',
	scheiben: 'Scheibe',
	slice: 'slice',
	slices: 'slice',
	kostka: 'kostka',
	kostki: 'kostka',
	becher: 'Becher',
	glas: 'Glas',
	słoik: 'słoik',
	jar: 'jar'
};

const unitOf = (w: string) => UNIT_ALIASES[w.toLocaleLowerCase('pl').replace(/\.$/, '')];

/**
 * Jedna linia składnika (jednostka zostaje tak, jak ją wpisano – porównania idą przez `baseUnit`): „500 g mąki”, „2 jajka”, „½ l mleka”, „Mąka 500 g”, „sól”.
 * Bez liczby – ilość null (wystarczy, że jest w domu).
 */
export function parseIngredient(line: string): Ingredient | null {
	const s = line.replace(/^[\s*•\-–]+/, '').replace(/\s+/g, ' ').trim();
	if (!s) return null;
	const words = s.split(' ');
	const lead = (ws: string[]): Ingredient | null => {
		// „1½” albo „2x” sklejone z liczbą
		const glued = /^(\d+(?:[.,]\d+)?)(x|g|kg|ml|l)$/i.exec(ws[0]);
		if (glued) return ws.length > 1 ? { qty: Number(glued[1].replace(',', '.')), unit: glued[2], name: ws.slice(1).join(' ') } : null;
		const qty = parseQty(ws[0]);
		if (qty === null || ws.length < 2) return null;
		const unit = unitOf(ws[1]);
		if (unit && ws.length > 2) return { qty, unit: ws[1], name: ws.slice(2).join(' ') };
		return { qty, unit: '', name: ws.slice(1).join(' ') };
	};
	const front = lead(words);
	if (front) return front;
	// Na końcu: „Mąka 500 g”, „Jajka 3”
	if (words.length >= 3 && unitOf(words.at(-1)!) && parseQty(words.at(-2)!) !== null)
		return { name: words.slice(0, -2).join(' '), qty: parseQty(words.at(-2)!), unit: words.at(-1)! };
	if (words.length >= 2 && parseQty(words.at(-1)!) !== null) return { name: words.slice(0, -1).join(' '), qty: parseQty(words.at(-1)!), unit: '' };
	return { name: s, qty: null, unit: '' };
}

/** Pole tekstowe (linia = składnik) → lista składników. */
export const parseIngredients = (text: string): Ingredient[] =>
	text
		.split(/\r?\n|;/)
		.map(parseIngredient)
		.filter((i): i is Ingredient => !!i)
		.slice(0, 60);

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Ilość do pokazania: „500 g”, „2”, „½ l”. */
export function fmtQty(i: Pick<Ingredient, 'qty' | 'unit'>): string {
	if (i.qty === null) return '';
	const q = i.qty === 0.5 ? '½' : i.qty === 0.25 ? '¼' : i.qty === 0.75 ? '¾' : num(i.qty);
	return i.unit ? `${q} ${i.unit}` : q;
}

/** Składnik z powrotem do jednej linii (edycja w panelu i na telefonie). */
export const ingredientLine = (i: Ingredient) => (i.qty === null ? i.name : `${fmtQty(i)} ${i.name}`);

// --- Brakujące składniki ---

/** Nazwa do porównań: małe litery, bez polskich/niemieckich znaków i zbędnych spacji. */
export const normName = (s: string) =>
	s
		.toLocaleLowerCase('pl')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/ł/g, 'l')
		.replace(/ß/g, 'ss')
		.replace(/\s+/g, ' ')
		.trim();

/** Jednostka bazowa do porównań i mnożnik: kg → g ×1000, l → ml ×1000, sztuki razem. */
export function baseUnit(unit: string): { unit: string; factor: number } {
	const u = (unitOf(unit) ?? unit).toLocaleLowerCase('pl').replace(/\.$/, '');
	if (u === 'kg') return { unit: 'g', factor: 1000 };
	if (u === 'l') return { unit: 'ml', factor: 1000 };
	if (u === '' || u === 'szt' || u === 'stk' || u === 'pcs') return { unit: 'pcs', factor: 1 };
	return { unit: u, factor: 1 };
}

export interface PlannedMeal {
	date: string;
	recipe: string;
	ingredients: Ingredient[];
}

export interface StockEntry {
	name: string;
	qty: number;
	unit: string;
}

export interface Missing {
	name: string;
	/** brakująca ilość w jednostce `unit`; null – ilość nieznana („trochę”) */
	qty: number | null;
	unit: string;
	/** dania, które go potrzebują */
	recipes: string[];
}

/**
 * Ta sama rzecz mimo odmiany: „mąki” = „mąka”, „pomidory” = „pomidor”, „eggs” = „egg”.
 * Po normalizacji: równe albo wspólny początek ≥ 3 znaki, różniący się najwyżej dwoma ostatnimi.
 */
export function sameProduct(a: string, b: string): boolean {
	const x = normName(a);
	const y = normName(b);
	if (x === y) return true;
	if (x.includes(' ') !== y.includes(' ')) return false;
	let p = 0;
	while (p < x.length && x[p] === y[p]) p++;
	return p >= 3 && p >= Math.max(x.length, y.length) - 2;
}

/**
 * Czego brakuje do zaplanowanych dań. Potrzeby sumują się po produkcie i jednostce (kg + g razem).
 * `stock` (zapasy) – null, gdy moduł zapasów nie działa: wtedy brakuje wszystkiego.
 * Zapas w tej samej jednostce odejmuje się od potrzeby; w innej (np. „op.” zamiast „g”) –
 * produkt liczy się jako „jest w domu”, jeśli jego ilość > 0. To, co już jest na liście zakupów, pomijamy.
 */
export function missingIngredients(meals: PlannedMeal[], stock: StockEntry[] | null, shopping: string[]): Missing[] {
	type Need = { name: string; unit: string; base: string; total: number | null; recipes: Set<string> };
	const needs: Need[] = [];
	for (const m of meals)
		for (const i of m.ingredients) {
			if (!normName(i.name)) continue;
			const b = baseUnit(i.unit);
			const base = i.qty === null ? '?' : b.unit;
			let cur = needs.find((n) => n.base === base && sameProduct(n.name, i.name));
			if (!cur) {
				cur = { name: i.name, unit: i.qty === null ? '' : b.factor > 1 ? b.unit : i.unit, base, total: i.qty === null ? null : 0, recipes: new Set() };
				needs.push(cur);
			}
			if (cur.total !== null && i.qty !== null) cur.total += i.qty * b.factor;
			cur.recipes.add(m.recipe);
		}

	const out: Missing[] = [];
	for (const need of needs) {
		if (shopping.some((s) => sameProduct(s, need.name))) continue;
		// Ten sam produkt z ilością i bez – wystarczy pozycja z ilością.
		if (need.total === null && needs.some((n) => n.total !== null && sameProduct(n.name, need.name))) continue;
		const have = (stock ?? []).filter((s) => sameProduct(s.name, need.name));
		const sameUnit = have.filter((s) => baseUnit(s.unit).unit === need.base);
		const anyQty = have.reduce((a, s) => a + s.qty, 0);
		let missing: number | null;
		if (need.total === null) {
			if (anyQty > 0) continue;
			missing = null;
		} else if (sameUnit.length) {
			const available = sameUnit.reduce((a, s) => a + s.qty * baseUnit(s.unit).factor, 0);
			missing = need.total - available;
			if (missing <= 0) continue;
		} else {
			if (anyQty > 0) continue;
			missing = need.total;
		}
		// 1500 g → 1,5 kg; 1000 ml → 1 l (po zsumowaniu wszystko było w gramach / mililitrach)
		const big = missing !== null && missing >= 1000 && (need.unit === 'g' || need.unit === 'ml');
		const qty = missing === null ? null : Math.round((big ? missing / 1000 : missing) * 100) / 100;
		out.push({ name: need.name, qty, unit: big ? (need.unit === 'g' ? 'kg' : 'l') : need.unit, recipes: [...need.recipes] });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}
