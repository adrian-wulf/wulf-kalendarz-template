import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { localShopping, mealPlan, pantryItems, pantryProducts, recipes, type Ingredient } from './db/schema.js';
import { addShopping, InputError } from './store.js';
import { getSetting, readCache } from './sync.js';
import { isBringReady } from './bring.js';
import { date, emoji, need, optId, raw, str, type Input } from './fields.js';
import { addDays } from '#lib/logic/dates.js';
import { daysFrom, fmtQty, isSlot, missingIngredients, normName, parseIngredients, slotsFor, type MealSlot, type Missing } from '#lib/logic/meals.js';
import { moduleConfig, resolveModules } from '#lib/modules/index.js';
import { mealsSettings } from '#lib/modules/meals/index.js';
import type { MealDay, MealsTile } from '#lib/modules/p3b-data.js';
import type { ShoppingItem } from '#lib/types.js';
import { t } from '#lib/i18n/index.js';

/** Plan posiłków: przepisy, plan na dni i brakujące składniki → lista zakupów. */

export const mealsConfig = (db: DB) => moduleConfig(mealsSettings, getSetting(db, 'modules'), 'meals');

export interface Recipe {
	id: number;
	name: string;
	emoji: string;
	ingredients: Ingredient[];
	notes: string;
}

export const listRecipes = (db: DB): Recipe[] => db.select().from(recipes).orderBy(asc(recipes.name)).all();

/** Plan na `days` dni od `from` – każdy dzień ma wszystkie pory z ustawień (puste: nazwa ''). */
export function planRange(db: DB, from: string, days: number, slots: MealSlot[] = slotsFor(mealsConfig(db).slots)): MealDay[] {
	const byId = new Map(listRecipes(db).map((r) => [r.id, r]));
	const rows = db
		.select()
		.from(mealPlan)
		.where(and(gte(mealPlan.date, from), lt(mealPlan.date, addDays(from, days))))
		.all();
	return daysFrom(from, days).map((d) => ({
		date: d,
		meals: slots.map((slot) => {
			const row = rows.find((r) => r.date === d && r.slot === slot);
			const recipe = row?.recipeId ? byId.get(row.recipeId) : undefined;
			return { slot, recipeId: recipe?.id ?? null, name: recipe?.name ?? row?.text ?? '', emoji: recipe?.emoji ?? (row?.text ? '🍽️' : '') };
		})
	}));
}

export const mealsTile = (db: DB, today: string): MealsTile => {
	const slots = slotsFor(mealsConfig(db).slots);
	return { slots, days: planRange(db, today, 7, slots) };
};

/**
 * Wpis w planie: `recipeId`, albo `name` (przepis o tej nazwie – inaczej sam tekst). Pusty → usunięcie.
 */
export function setMeal(db: DB, input: Input) {
	const day = date(input, 'date');
	const slot = str(input, 'slot');
	if (!isSlot(slot)) throw new InputError(t('meals.err.slot'));
	let recipeId = optId(input, 'recipeId');
	let text: string | null = null;
	if (recipeId !== null) {
		if (!db.select().from(recipes).where(eq(recipes.id, recipeId)).get()) throw new InputError(t('meals.err.recipe'));
	} else {
		const name = str(input, 'name');
		if (name.length > 80) throw new InputError(t('err.tooLong', { label: t('meals.dish') }));
		const match = name ? listRecipes(db).find((r) => normName(r.name) === normName(name)) : undefined;
		recipeId = match?.id ?? null;
		text = match ? null : name || null;
	}
	if (recipeId === null && !text) {
		db.delete(mealPlan).where(and(eq(mealPlan.date, day), eq(mealPlan.slot, slot))).run();
		return null;
	}
	return db
		.insert(mealPlan)
		.values({ date: day, slot, recipeId, text })
		.onConflictDoUpdate({ target: [mealPlan.date, mealPlan.slot], set: { recipeId, text } })
		.returning()
		.get();
}

/** Składniki: tablica (JSON) albo tekst – linia = składnik. */
function ingredientsOf(input: Input): Ingredient[] {
	const v = raw(input, 'ingredients');
	if (Array.isArray(v)) return parseIngredients(v.map(String).join('\n'));
	return parseIngredients(typeof v === 'string' ? v : '');
}

export function saveRecipe(db: DB, input: Input) {
	const id = optId(input, 'id');
	const row = {
		name: need(input, 'name', t('meals.dish'), 60),
		emoji: emoji(input, 'emoji', '🍽️'),
		ingredients: ingredientsOf(input),
		notes: str(input, 'notes').slice(0, 1000)
	};
	const same = listRecipes(db).find((r) => r.id !== id && normName(r.name) === normName(row.name));
	if (same) throw new InputError(t('meals.err.duplicate', { name: same.name }));
	if (id) return db.update(recipes).set(row).where(eq(recipes.id, id)).returning().get();
	return db.insert(recipes).values(row).returning().get();
}

export const deleteRecipe = (db: DB, input: Input) => {
	const id = optId(input, 'id');
	if (id) db.delete(recipes).where(eq(recipes.id, id)).run();
};

/** Nazwy z listy zakupów (Bring! albo lokalna). */
function shoppingNames(db: DB): string[] {
	if (isBringReady(db)) return (readCache<ShoppingItem[]>(db, 'bring').data ?? []).map((i) => i.name);
	return db.select({ name: localShopping.name }).from(localShopping).all().map((r) => r.name);
}

/** Zapasy jako lista (nazwa, ilość, jednostka) – null, gdy moduł zapasów nie działa albo wyłączono to w ustawieniach. */
function pantryStock(db: DB, use: boolean) {
	// Bez importu rejestru (cykl z hooks.server.ts) – stan modułów prosto z ustawień.
	if (!use || !resolveModules(getSetting(db, 'modules')).find((m) => m.id === 'pantry')?.active) return null;
	return db
		.select({ name: pantryProducts.name, qty: pantryItems.qty, unit: pantryProducts.unit })
		.from(pantryItems)
		.innerJoin(pantryProducts, eq(pantryItems.productId, pantryProducts.id))
		.all();
}

export interface MissingResult {
	from: string;
	days: number;
	usesPantry: boolean;
	items: (Missing & { label: string })[];
}

/** Brakujące składniki do dań zaplanowanych od `from` na tyle dni, ile w ustawieniach (domyślnie tydzień). */
export function missingFor(db: DB, from: string, days = mealsConfig(db).shoppingDays): MissingResult {
	const cfg = mealsConfig(db);
	const byId = new Map(listRecipes(db).map((r) => [r.id, r]));
	const planned = planRange(db, from, days)
		.flatMap((d) => d.meals.map((m) => ({ date: d.date, id: m.recipeId })))
		.flatMap(({ date: d, id }) => {
			const r = id ? byId.get(id) : undefined;
			return r ? [{ date: d, recipe: r.name, ingredients: r.ingredients }] : [];
		});
	const stock = pantryStock(db, cfg.usePantry);
	const items = missingIngredients(planned, stock, shoppingNames(db)).map((m) => ({ ...m, label: fmtQty(m) }));
	return { from, days, usesPantry: stock !== null, items };
}

/**
 * Dopisuje wybrane braki do listy zakupów. `names` – nazwy z `missingFor` (inne są pomijane, żeby
 * kiosk nie dopisał przypadkiem czegoś spoza listy). Ilość trafia do opisu pozycji (lista lokalna).
 */
export async function addMissing(db: DB, from: string, names: unknown): Promise<{ added: string[] }> {
	if (!Array.isArray(names)) throw new InputError(t('meals.err.names'));
	const wanted = new Set(names.map((n) => normName(String(n))));
	const items = missingFor(db, from).items.filter((m) => wanted.has(normName(m.name)));
	const added: string[] = [];
	for (const m of items) {
		const row = await addShopping(db, { name: m.name });
		if (row.id && !row.spec && m.label) db.update(localShopping).set({ spec: m.label }).where(eq(localShopping.id, row.id)).run();
		added.push(m.name);
	}
	return { added };
}

/** Dane strony telefonu i okna kiosku: plan, przepisy, pory. */
export function mealsData(db: DB, from: string, days = 7) {
	const slots = slotsFor(mealsConfig(db).slots);
	return { from, slots, days: planRange(db, from, days, slots), recipes: listRecipes(db) };
}

const ONE_DAY_MS = 86_400_000;
export const validFrom = (v: string | null, today: string) => {
	if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return today;
	// nie dalej niż rok w obie strony
	return Math.abs(Date.parse(v) - Date.parse(today)) > 366 * ONE_DAY_MS ? today : v;
};

/** Przykładowe przepisy i plan na kilka dni (w języku interfejsu). Nie dubluje danych. */
export function seedMeals(db: DB, today: string) {
	if (db.select().from(recipes).all().length) return;
	const demo: [string, string][] = [
		['🍝', 'r1'],
		['🥞', 'r2'],
		['🍅', 'r3'],
		['🍗', 'r4'],
		['🍕', 'r5']
	];
	const ids = demo.map(
		([e, k]) =>
			db
				.insert(recipes)
				.values({
					name: t(`demo.meals.${k}` as 'demo.meals.r1'),
					emoji: e,
					ingredients: parseIngredients(t(`demo.meals.${k}.ing` as 'demo.meals.r1.ing').split('|').join('\n')),
					notes: ''
				})
				.returning()
				.get().id
	);
	const plan = [0, 1, 2, 4, 5];
	plan.forEach((offset, i) => db.insert(mealPlan).values({ date: addDays(today, offset), slot: 'lunch', recipeId: ids[i] }).onConflictDoNothing().run());
	db.insert(mealPlan).values({ date: addDays(today, 3), slot: 'lunch', text: t('demo.meals.leftovers') }).onConflictDoNothing().run();
	db.insert(mealPlan).values({ date: today, slot: 'dinner', text: t('demo.meals.sandwiches') }).onConflictDoNothing().run();
	db.insert(mealPlan).values({ date: addDays(today, 1), slot: 'dinner', recipeId: ids[2] }).onConflictDoNothing().run();
}
