import { addDays, daysBetween } from './dates.js';
import { compare, t, tn } from '#lib/i18n/index.js';

/** Zapasy w piwnicy – wspólne typy i czysta logika (kiosk, telefon, serwer). */

/** Kategorie zapasów: identyfikator (zapisany w bazie) i ikona; nazwy w słowniku (`pantry.cat.<id>`). */
export const CATEGORIES = [
	['mieso', '🥩'],
	['gotowe', '🍲'],
	['warzywa', '🥦'],
	['pieczywo', '🍞'],
	['nabial', '🧀'],
	['przetwory', '🥫'],
	['sypkie', '🍝'],
	['przyprawy', '🧂'],
	['napoje', '🥤'],
	['slodycze', '🍫'],
	['chemia', '🧴'],
	['inne', '📦']
] as const;

export type Category = (typeof CATEGORIES)[number][0];
export const categoryIds = CATEGORIES.map(([id]) => id) as readonly string[];

const withLabel = ([id, icon]: (typeof CATEGORIES)[number]) => [id, icon, t(`pantry.cat.${id}`)] as const;

/** Kategorie z nazwami w bieżącym języku: [id, ikona, nazwa]. */
export const categories = () => CATEGORIES.map(withLabel);
export const categoryOf = (id: string) => withLabel(CATEGORIES.find(([c]) => c === id) ?? CATEGORIES[CATEGORIES.length - 1]);

export interface Place {
	id: string;
	name: string;
	icon: string;
	freezer: boolean;
}

export interface PantryProduct {
	id: number;
	name: string;
	icon: string | null;
	category: string;
	unit: string;
	minQty: number | null;
	uses: number;
	lastPlaceId: string | null;
}

export interface PantryItem {
	id: number;
	productId: number;
	placeId: string;
	qty: number;
	addedAt: string;
	bestBefore: string | null;
}

/** Po tylu dniach w zamrażarce – „zużyj najpierw”. */
export const FREEZER_OLD_DAYS = 180;
/** Tyle dni przed datą ważności – ostrzeżenie. */
export const EXPIRY_WARN_DAYS = 7;

export type ItemWarn = 'expired' | 'expiring' | 'old' | null;

/** Progi ostrzeżeń (ustawienia modułu Zapasy). */
export interface WarnLimits {
	expiryWarnDays: number;
	freezerOldDays: number;
}

export function itemWarn(
	item: PantryItem,
	place: Place,
	today: string,
	limits: WarnLimits = { expiryWarnDays: EXPIRY_WARN_DAYS, freezerOldDays: FREEZER_OLD_DAYS }
): ItemWarn {
	if (item.qty <= 0) return null;
	if (item.bestBefore && item.bestBefore < today) return 'expired';
	if (item.bestBefore && item.bestBefore <= addDays(today, limits.expiryWarnDays)) return 'expiring';
	if (place.freezer && daysBetween(item.addedAt, today) > limits.freezerOldDays) return 'old';
	return null;
}

/** „od dziś”, „od 5 dni”, „od 3 tyg.”, „od 4 mies.” */
export function ageLabel(addedAt: string, today: string): string {
	const d = daysBetween(addedAt, today);
	if (d <= 0) return t('pantry.age.today');
	if (d === 1) return t('pantry.age.yesterday');
	if (d < 14) return tn('pantry.age.days', d);
	if (d < 60) return tn('pantry.age.weeks', Math.round(d / 7));
	return tn('pantry.age.months', Math.round(d / 30));
}

/** Próg „trzeba dokupić”: ustawione minimum albo „gdy się skończy”. */
export const threshold = (p: Pick<PantryProduct, 'minQty'>) => p.minQty ?? 1;

/** Czy zmiana ilości właśnie przekroczyła próg w dół (wtedy – do listy zakupów). */
export const crossedLow = (p: Pick<PantryProduct, 'minQty'>, before: number, after: number) => after < threshold(p) && before >= threshold(p);

// Zgadywanie kategorii po nazwie (początki słów, bez znaków diakrytycznych) – podpowiedź, do zmiany jednym dotknięciem.
// Słowa polskie, niemieckie i angielskie razem: w domu mieszanym każdy wpisuje po swojemu.
// Kolejność ma znaczenie (wygrywa pierwsza kategoria), np. „paluszki rybne” to gotowe danie, nie ryba.
const GUESS: [Category, string[]][] = [
	['gotowe', [
		'pierog', 'zup', 'golab', 'pizz', 'lasagn', 'obiad', 'krokiet', 'nalesnik', 'bigos', 'gulasz', 'frytk', 'paluszki rybne', 'kopytk', 'knedl',
		'suppe', 'eintopf', 'maultasche', 'pommes', 'fischstabchen', 'fertiggericht', 'auflauf', 'gulasch', 'knodel',
		'soup', 'stew', 'fries', 'fish fingers', 'ready meal', 'dumpling'
	]],
	['mieso', [
		'mieso', 'miesn', 'kurczak', 'kurcz', 'indyk', 'wolow', 'wieprz', 'schab', 'kark', 'kielbas', 'parowk', 'boczek', 'szynk', 'ryb', 'losos', 'dorsz', 'krewet', 'udk', 'skrzydel', 'filet', 'mielon', 'kotlet', 'zeberk',
		'fleisch', 'hahnchen', 'hühnchen', 'huhn', 'pute', 'rind', 'schwein', 'hack', 'wurst', 'wurstchen', 'speck', 'schinken', 'fisch', 'lachs', 'kabeljau', 'garnele', 'schnitzel', 'kotelett',
		'meat', 'chicken', 'turkey', 'beef', 'pork', 'mince', 'sausage', 'bacon', 'ham', 'fish', 'salmon', 'cod', 'prawn', 'shrimp', 'steak', 'wings', 'drumstick'
	]],
	['nabial', [
		'mlek', 'ser', 'jogurt', 'maslo', 'smietan', 'twarog', 'kefir', 'jajk', 'jaj',
		'milch', 'kase', 'joghurt', 'butter', 'sahne', 'quark', 'eier',
		'milk', 'cheese', 'yogurt', 'yoghurt', 'sour cream', 'egg'
	]],
	['pieczywo', [
		'chleb', 'bulk', 'bagiet', 'ciast', 'tost', 'rogal', 'drozdzow',
		'brot', 'brotchen', 'baguette', 'kuchen', 'toast', 'croissant', 'semmel',
		'bread', 'bun', 'cake', 'bagel'
	]],
	['przetwory', [
		'pomidory w puszce', 'puszk', 'sloik', 'dzem', 'konfitur', 'ogorki kiszone', 'ogorki konserw', 'koncentrat', 'passat', 'fasol', 'ciecierzyc', 'kukurydz', 'groszek', 'tunczyk', 'sledz', 'pasztet', 'kompot', 'przecier', 'miod',
		'dose', 'konserve', 'marmelade', 'konfiture', 'gewurzgurke', 'tomatenmark', 'bohnen', 'kichererbse', 'mais', 'erbsen', 'thunfisch', 'hering', 'honig', 'eingemacht',
		'tinned', 'canned', 'tin of', 'jam', 'pickle', 'beans', 'chickpea', 'sweetcorn', 'tuna', 'honey', 'passata'
	]],
	['sypkie', [
		'makaron', 'spaghetti', 'ryz', 'kasz', 'mak', 'cukier', 'platki', 'musli', 'owsian', 'bulka tarta', 'proszek do piecz', 'drozdz',
		'nudel', 'reis', 'mehl', 'zucker', 'haferflocken', 'flocken', 'grieß', 'griess', 'paniermehl', 'backpulver', 'hefe',
		'penne', 'fusilli', 'macaroni', 'noodle', 'rice', 'flour', 'sugar', 'oats', 'cereal', 'muesli', 'couscous', 'yeast', 'baking powder'
	]],
	['przyprawy', [
		'przypraw', 'sol', 'pieprz', 'papryka slodka', 'ketchup', 'majonez', 'musztard', 'sos', 'olej', 'oliwa', 'ocet', 'bulion', 'kostk',
		'gewurz', 'salz', 'pfeffer', 'paprikapulver', 'mayo', 'senf', 'sosse', 'soße', 'olivenol', 'rapsol', 'speiseol', 'sonnenblumenol', 'essig', 'bruhe', 'brühe',
		'spice', 'salt', 'pepper', 'mustard', 'sauce', 'oil', 'vinegar', 'stock', 'mayonnaise'
	]],
	['napoje', [
		'sok', 'wod', 'piw', 'win', 'napoj', 'col', 'lemoniad', 'kaw', 'herbat', 'syrop',
		'saft', 'wasser', 'bier', 'wein', 'getrank', 'limo', 'kaffee', 'tee', 'sirup', 'sprudel',
		'juice', 'water', 'beer', 'wine', 'drink', 'lemonade', 'coffee', 'tea', 'squash'
	]],
	['slodycze', [
		'czekolad', 'ciastk', 'chips', 'lod', 'baton', 'cukierk', 'zelk', 'paluszk', 'orzesz', 'krakers', 'wafl',
		'schokolade', 'keks', 'eis', 'riegel', 'bonbon', 'gummi', 'salzstange', 'nusse', 'cracker', 'waffel', 'kekse',
		'chocolate', 'biscuit', 'cookie', 'crisps', 'ice cream', 'candy', 'sweets', 'nuts', 'wafer'
	]],
	['warzywa', [
		'ziemniak', 'marchew', 'cebul', 'czosnek', 'warzyw', 'mieszanka', 'brokul', 'kalafior', 'szpinak', 'fasolka', 'jablk', 'owoc', 'trusk', 'malin', 'jagod', 'banan', 'pomarancz', 'cytryn', 'kapust', 'burak', 'dyni', 'ogork', 'papryk', 'pomidor', 'salat',
		'kartoffel', 'mohre', 'möhre', 'karotte', 'zwiebel', 'knoblauch', 'gemuse', 'brokkoli', 'blumenkohl', 'spinat', 'apfel', 'apfel', 'obst', 'erdbeer', 'himbeer', 'heidelbeer', 'orange', 'zitrone', 'kohl', 'rote bete', 'kurbis', 'gurke', 'paprika', 'tomate', 'salat',
		'potato', 'carrot', 'onion', 'garlic', 'vegetable', 'veg', 'broccoli', 'cauliflower', 'spinach', 'apple', 'fruit', 'strawberr', 'raspberr', 'blueberr', 'banana', 'lemon', 'cabbage', 'beetroot', 'pumpkin', 'cucumber', 'tomato', 'lettuce', 'peas'
	]],
	['chemia', [
		'papier', 'recznik', 'proszek', 'plyn', 'mydl', 'szampon', 'past', 'worki', 'pieluch', 'chusteczk', 'tabletki do zmyw', 'kapsulk', 'gabk', 'folia', 'baterie',
		'toilettenpapier', 'klopapier', 'kuchenrolle', 'waschmittel', 'spulmittel', 'seife', 'shampoo', 'zahnpasta', 'mullbeutel', 'windel', 'taschentuch', 'tabs', 'schwamm', 'folie', 'batterie',
		'paper', 'towel', 'detergent', 'washing', 'soap', 'toothpaste', 'bin bag', 'nappies', 'nappy', 'diaper', 'tissue', 'sponge', 'foil', 'batteries', 'shampoo'
	]]
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/ß/g, 'ss');
const KEYS: [Category, string[]][] = GUESS.map(([c, keys]) => [c, [...new Set(keys.map(fold))]]);

export function guessCategory(name: string): Category {
	const n = fold(name.trim());
	const words = n.split(/\s+/);
	for (const [cat, keys] of KEYS) if (keys.some((k) => (k.includes(' ') ? n.startsWith(k) : words.some((w) => w.startsWith(k))))) return cat;
	return 'inne';
}

/** Pozycje miejsca pogrupowane w kategorie (kolejność jak w CATEGORIES); w grupie wg nazwy, partie od najstarszej. */
export function groupByCategory<T extends PantryItem & { product: Pick<PantryProduct, 'name' | 'category'> }>(items: T[]) {
	const order = new Map(CATEGORIES.map(([id], i) => [id as string, i]));
	const groups = new Map<string, T[]>();
	for (const i of items) groups.set(i.product.category, [...(groups.get(i.product.category) ?? []), i]);
	return [...groups]
		.sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
		.map(([cat, list]) => [categoryOf(cat), list.sort((a, b) => compare(a.product.name, b.product.name) || a.addedAt.localeCompare(b.addedAt))] as const);
}

/** Szybkie dodawanie: najpierw produkty używane w tym miejscu, potem pozostałe (wg częstości). */
export function frequentFor(products: PantryProduct[], placeId: string, limit = 18) {
	return [...products.filter((p) => p.lastPlaceId === placeId), ...products.filter((p) => p.lastPlaceId !== placeId)].slice(0, limit);
}
