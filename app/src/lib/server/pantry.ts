import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { pantryItems, pantryPlaces, pantryProducts } from './db/schema.js';
import { addShopping, InputError } from './store.js';
import { getSetting } from './sync.js';
import { iconFor } from '#lib/products.js';
import { moduleConfig } from '#lib/modules/index.js';
import { pantrySettings } from '#lib/modules/pantry/index.js';
import { categoryIds, categoryOf, crossedLow, guessCategory, itemWarn, type PantryItem, type PantryProduct, type Place } from '#lib/logic/pantry.js';
import { getLang, LANGS, t, translate, type Lang } from '#lib/i18n/index.js';

/** Zapasy: spiżarnia i zamrażarka – stan, szybkie dodawanie, automatyczne zakupy. */

export interface PantryRow extends PantryItem {
	product: PantryProduct;
	warn: ReturnType<typeof itemWarn>;
}

export interface PantryData {
	today: string;
	places: Place[];
	items: PantryRow[];
	/** zapamiętane produkty, najczęściej dodawane najpierw */
	products: PantryProduct[];
	summary: PantrySummary;
}

export interface PantrySummary {
	/** produkty poniżej ustawionego minimum */
	low: number;
	/** partie z ostrzeżeniem (stare w zamrażarce, kończy się data) */
	warn: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function listPlaces(db: DB): Place[] {
	return db
		.select()
		.from(pantryPlaces)
		.orderBy(asc(pantryPlaces.sortOrder))
		.all()
		.map(({ sortOrder: _, ...p }) => p);
}

const totalOf = (db: DB, productId: number) =>
	db
		.select({ n: sql<number>`coalesce(sum(${pantryItems.qty}), 0)` })
		.from(pantryItems)
		.where(eq(pantryItems.productId, productId))
		.get()!.n;

/** Progi ostrzeżeń z ustawień modułu Zapasy (panel → Zapasy). */
export const pantryLimits = (db: DB) => moduleConfig(pantrySettings, getSetting(db, 'modules'), 'pantry');

export function pantryData(db: DB, today: string, limits = pantryLimits(db)): PantryData {
	const places = listPlaces(db);
	const products = db.select().from(pantryProducts).orderBy(desc(pantryProducts.uses), asc(pantryProducts.name)).all();
	const byId = new Map(products.map((p) => [p.id, p]));
	const items = db
		.select()
		.from(pantryItems)
		.orderBy(asc(pantryItems.addedAt))
		.all()
		.map((i) => ({ ...i, product: byId.get(i.productId)!, warn: itemWarn(i, places.find((p) => p.id === i.placeId)!, today, limits) }));
	return { today, places, items, products, summary: summarize(products, items) };
}

function summarize(products: PantryProduct[], items: PantryRow[]): PantrySummary {
	const totals = new Map<number, number>();
	for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.qty);
	return {
		low: products.filter((p) => p.minQty != null && (totals.get(p.id) ?? 0) < p.minQty).length,
		warn: items.filter((i) => i.warn).length
	};
}

export const pantrySummary = (db: DB, today: string, limits = pantryLimits(db)) => pantryData(db, today, limits).summary;

function place(db: DB, id: unknown): Place {
	const p = typeof id === 'string' ? listPlaces(db).find((x) => x.id === id) : undefined;
	if (!p) throw new InputError('Nieznane miejsce');
	return p;
}

/**
 * Dodanie (z kiosku/telefonu): produkt zapamiętujemy (nowy albo „uses + 1”).
 * Spiżarnia: jeden wiersz na produkt (ilość się sumuje). Zamrażarka: partia z datą włożenia.
 */
export function addPantry(db: DB, input: Record<string, unknown>, today: string) {
	const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
	if (!name || name.length > 60) throw new InputError(t('err.productName'));
	const pl = place(db, input.placeId);
	const qty = input.qty == null ? 1 : Number(input.qty);
	if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new InputError(t('err.qty'));
	const bestBefore = input.bestBefore || null;
	if (bestBefore !== null && (typeof bestBefore !== 'string' || !DATE.test(bestBefore))) throw new InputError(t('err.bestBefore'));
	const addedAt = input.date || today;
	if (typeof addedAt !== 'string' || !DATE.test(addedAt)) throw new InputError(t('err.date'));
	const category = typeof input.category === 'string' && categoryIds.includes(input.category) ? input.category : null;

	return db.transaction((tx) => {
		let product = tx
			.select()
			.from(pantryProducts)
			.where(sql`lower(${pantryProducts.name}) = ${name.toLowerCase()}`)
			.get();
		if (!product) {
			product = tx
				.insert(pantryProducts)
				.values({ name, icon: iconFor(name) ?? categoryOf(category ?? guessCategory(name))[1], category: category ?? guessCategory(name), lastPlaceId: pl.id, uses: 1 })
				.returning()
				.get();
		} else {
			tx.update(pantryProducts)
				.set({ uses: sql`${pantryProducts.uses} + 1`, lastPlaceId: pl.id, ...(category ? { category } : {}) })
				.where(eq(pantryProducts.id, product.id))
				.run();
		}
		const same = and(eq(pantryItems.productId, product.id), eq(pantryItems.placeId, pl.id), ...(pl.freezer ? [eq(pantryItems.addedAt, addedAt)] : []));
		const existing = tx.select().from(pantryItems).where(same).get();
		if (existing) {
			tx.update(pantryItems)
				.set({ qty: existing.qty + qty, ...(bestBefore ? { bestBefore } : {}), ...(pl.freezer ? {} : { addedAt }) })
				.where(eq(pantryItems.id, existing.id))
				.run();
			return { productId: product.id, itemId: existing.id };
		}
		const row = tx.insert(pantryItems).values({ productId: product.id, placeId: pl.id, qty, addedAt, bestBefore }).returning().get();
		return { productId: product.id, itemId: row.id };
	});
}

/**
 * −/+ przy pozycji. Partia w zamrażarce przy 0 znika; w spiżarni zostaje jako „skończyło się”
 * (łatwo uzupełnić). Gdy łączna ilość spadnie poniżej progu – produkt idzie do zakupów (Bring!).
 */
export async function adjustPantry(db: DB, input: Record<string, unknown>): Promise<{ shopping: string | null; shoppingError?: string }> {
	const delta = Number(input.delta);
	if (delta !== 1 && delta !== -1) throw new InputError('Zmiana o 1');
	const item = db.select().from(pantryItems).where(eq(pantryItems.id, Number(input.itemId))).get();
	if (!item) throw new InputError('Nie ma takiej pozycji');
	const product = db.select().from(pantryProducts).where(eq(pantryProducts.id, item.productId)).get()!;
	const pl = place(db, item.placeId);
	const before = totalOf(db, product.id);
	const qty = Math.max(0, item.qty + delta);
	if (qty === 0 && pl.freezer) db.delete(pantryItems).where(eq(pantryItems.id, item.id)).run();
	else db.update(pantryItems).set({ qty }).where(eq(pantryItems.id, item.id)).run();
	const after = totalOf(db, product.id);
	if (delta < 0 && crossedLow(product, before, after)) {
		try {
			await addShopping(db, { name: product.name });
			return { shopping: product.name };
		} catch (e) {
			return { shopping: null, shoppingError: e instanceof Error ? e.message : String(e) };
		}
	}
	return { shopping: null };
}

export function removePantryItem(db: DB, id: number) {
	db.delete(pantryItems).where(eq(pantryItems.id, id)).run();
}

// --- Panel: pełna edycja (FormData) ---

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function intOrNull(v: string, label: string, max = 999) {
	if (!v) return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 0 || n > max) throw new InputError(t('err.int', { label, max }));
	return n;
}

export function savePlace(db: DB, f: FormData) {
	const name = str(f, 'name');
	if (!name || name.length > 30) throw new InputError(t('err.placeName'));
	const values = { name, icon: str(f, 'icon').slice(0, 8) || '📦', freezer: f.get('freezer') === 'on' };
	const id = str(f, 'id');
	if (id) return void db.update(pantryPlaces).set(values).where(eq(pantryPlaces.id, id)).run();
	const all = listPlaces(db);
	const base =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.replace(/ł/g, 'l')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'miejsce';
	let newId = base;
	for (let i = 2; all.some((p) => p.id === newId); i++) newId = `${base}-${i}`;
	db.insert(pantryPlaces)
		.values({ id: newId, ...values, sortOrder: all.length })
		.run();
}

export function deletePlace(db: DB, f: FormData) {
	if (listPlaces(db).length <= 1) throw new InputError(t('err.lastPlace'));
	db.delete(pantryPlaces).where(eq(pantryPlaces.id, str(f, 'id'))).run();
}

export function saveProduct(db: DB, f: FormData) {
	const name = str(f, 'name');
	if (!name || name.length > 60) throw new InputError(t('err.productName'));
	const category = str(f, 'category');
	if (!categoryIds.includes(category)) throw new InputError(t('err.category'));
	const values = { name, icon: str(f, 'icon').slice(0, 8) || null, category, unit: str(f, 'unit').slice(0, 12) || t('pantry.admin.defaultUnit'), minQty: intOrNull(str(f, 'minQty'), t('pantry.admin.min')) };
	const id = Number(str(f, 'id'));
	try {
		if (id) db.update(pantryProducts).set(values).where(eq(pantryProducts.id, id)).run();
		else db.insert(pantryProducts).values(values).run();
	} catch (e) {
		if (String(e).includes('UNIQUE')) throw new InputError(t('err.productDup'));
		throw e;
	}
}

export function deleteProduct(db: DB, f: FormData) {
	db.delete(pantryProducts).where(eq(pantryProducts.id, Number(str(f, 'id')))).run();
}

export function saveItem(db: DB, f: FormData) {
	const qty = intOrNull(str(f, 'qty'), t('pantry.admin.qty')) ?? 0;
	const addedAt = str(f, 'addedAt');
	const bestBefore = str(f, 'bestBefore');
	if (!DATE.test(addedAt) || (bestBefore && !DATE.test(bestBefore))) throw new InputError(t('err.date'));
	db.update(pantryItems)
		.set({ qty, addedAt, bestBefore: bestBefore || null })
		.where(eq(pantryItems.id, Number(str(f, 'id'))))
		.run();
}

export function deleteItem(db: DB, f: FormData) {
	removePantryItem(db, Number(str(f, 'id')));
}


/**
 * Domyślne miejsca z migracji (spiżarnia, zamrażarka) dostają nazwę w języku interfejsu – tylko
 * dopóki mają nazwę domyślną w którymś języku (własnej nazwy z panelu nie ruszamy).
 */
export function localizeDefaultPlaces(db: DB, lang: Lang = getLang()) {
	const defaults = { spizarnia: 'demo.place.pantry', zamrazarka: 'demo.place.freezer' } as const;
	for (const [id, key] of Object.entries(defaults)) {
		const row = db.select().from(pantryPlaces).where(eq(pantryPlaces.id, id)).get();
		if (row && LANGS.some((l) => translate(l, key) === row.name)) db.update(pantryPlaces).set({ name: translate(lang, key) }).where(eq(pantryPlaces.id, id)).run();
	}
}
