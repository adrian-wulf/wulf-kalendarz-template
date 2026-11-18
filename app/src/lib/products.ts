import { getLang, LANGS, type Lang } from './i18n/index.js';

/**
 * Podręczny katalog produktów z ikonami – podpowiedzi na kiosku, dopóki nie ma Bring!.
 * Jedna lista na język (te same pozycje, ta sama kolejność); ikona po nazwie działa we wszystkich
 * językach naraz, bo w domu każdy może wpisywać po swojemu.
 */
const ICONS = [
	'🥛', '🍞', '🥖', '🧈', '🧀', '🥚', '🥣', '🥛', '🧀', '🥓', '🌭', '🍗',
	'🥩', '🐟', '🍌', '🍎', '🍐', '🍊', '🍋', '🍇', '🍓', '🍅', '🥒', '🫑',
	'🥔', '🥕', '🧅', '🧄', '🥬', '🥦', '🍄', '🌽', '🍝', '🍚', '🌾', '🧂',
	'🧂', '🫒', '☕', '🍵', '🧃', '💧', '🍺', '🍷', '🍫', '🍪', '🍟', '🍦',
	'🥣', '🍯', '🍓', '🍅', '🍕', '🧷', '🧻', '🧻', '🧻', '🧼', '🧴', '🪥',
	'🧺', '🧽', '🗑️', '🔋', '🐱', '💐'
];

const NAMES: Record<Lang, string[]> = {
	pl: [
		'Mleko', 'Chleb', 'Bułki', 'Masło', 'Ser', 'Jajka', 'Jogurt', 'Śmietana', 'Twaróg', 'Szynka', 'Kiełbasa', 'Kurczak',
		'Mięso mielone', 'Ryba', 'Banany', 'Jabłka', 'Gruszki', 'Pomarańcze', 'Cytryny', 'Winogrona', 'Truskawki', 'Pomidory', 'Ogórki', 'Papryka',
		'Ziemniaki', 'Marchew', 'Cebula', 'Czosnek', 'Sałata', 'Brokuł', 'Pieczarki', 'Kukurydza', 'Makaron', 'Ryż', 'Mąka', 'Cukier',
		'Sól', 'Olej', 'Kawa', 'Herbata', 'Sok', 'Woda', 'Piwo', 'Wino', 'Czekolada', 'Ciastka', 'Chipsy', 'Lody',
		'Płatki', 'Miód', 'Dżem', 'Ketchup', 'Pizza', 'Pieluchy', 'Chusteczki', 'Papier toaletowy', 'Ręczniki papierowe', 'Mydło', 'Szampon', 'Pasta do zębów',
		'Proszek do prania', 'Płyn do naczyń', 'Worki na śmieci', 'Baterie', 'Karma dla kota', 'Kwiaty'
	],
	de: [
		'Milch', 'Brot', 'Brötchen', 'Butter', 'Käse', 'Eier', 'Joghurt', 'Sahne', 'Quark', 'Schinken', 'Wurst', 'Hähnchen',
		'Hackfleisch', 'Fisch', 'Bananen', 'Äpfel', 'Birnen', 'Orangen', 'Zitronen', 'Weintrauben', 'Erdbeeren', 'Tomaten', 'Gurken', 'Paprika',
		'Kartoffeln', 'Karotten', 'Zwiebeln', 'Knoblauch', 'Salat', 'Brokkoli', 'Champignons', 'Mais', 'Nudeln', 'Reis', 'Mehl', 'Zucker',
		'Salz', 'Öl', 'Kaffee', 'Tee', 'Saft', 'Wasser', 'Bier', 'Wein', 'Schokolade', 'Kekse', 'Chips', 'Eis',
		'Müsli', 'Honig', 'Marmelade', 'Ketchup', 'Pizza', 'Windeln', 'Taschentücher', 'Toilettenpapier', 'Küchenrolle', 'Seife', 'Shampoo', 'Zahnpasta',
		'Waschmittel', 'Spülmittel', 'Müllbeutel', 'Batterien', 'Katzenfutter', 'Blumen'
	],
	en: [
		'Milk', 'Bread', 'Rolls', 'Butter', 'Cheese', 'Eggs', 'Yoghurt', 'Cream', 'Cottage cheese', 'Ham', 'Sausages', 'Chicken',
		'Mince', 'Fish', 'Bananas', 'Apples', 'Pears', 'Oranges', 'Lemons', 'Grapes', 'Strawberries', 'Tomatoes', 'Cucumber', 'Peppers',
		'Potatoes', 'Carrots', 'Onions', 'Garlic', 'Lettuce', 'Broccoli', 'Mushrooms', 'Sweetcorn', 'Pasta', 'Rice', 'Flour', 'Sugar',
		'Salt', 'Oil', 'Coffee', 'Tea', 'Juice', 'Water', 'Beer', 'Wine', 'Chocolate', 'Biscuits', 'Crisps', 'Ice cream',
		'Cereal', 'Honey', 'Jam', 'Ketchup', 'Pizza', 'Nappies', 'Tissues', 'Toilet paper', 'Kitchen roll', 'Soap', 'Shampoo', 'Toothpaste',
		'Washing powder', 'Washing-up liquid', 'Bin bags', 'Batteries', 'Cat food', 'Flowers'
	]
};

/** [nazwa, ikona] w danym języku. */
export const productsFor = (lang: Lang = getLang()): [string, string][] => NAMES[lang].map((n, i) => [n, ICONS[i]]);

/** Polska lista (zgodność wstecz). */
export const PRODUCTS = productsFor('pl');

const ALL: [string, string][] = LANGS.flatMap((l) => productsFor(l));

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/ß/g, 'ss');

/** Podpowiedzi w języku interfejsu: najpierw początek nazwy, potem dowolny fragment. */
export function suggestProducts(q: string, limit = 8, lang: Lang = getLang()): { name: string; icon: string }[] {
	const n = norm(q.trim());
	if (!n) return [];
	const list = productsFor(lang);
	const starts = list.filter(([name]) => norm(name).startsWith(n));
	const contains = list.filter(([name]) => !norm(name).startsWith(n) && norm(name).includes(n));
	return [...starts, ...contains].slice(0, limit).map(([name, icon]) => ({ name, icon }));
}

/** Ikona po nazwie produktu – w dowolnym z języków. */
export function iconFor(name: string): string | undefined {
	const n = norm(name);
	return ALL.find(([p]) => norm(p) === n)?.[1] ?? ALL.find(([p]) => n.startsWith(norm(p) + ' '))?.[1];
}
