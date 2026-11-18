import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { localShopping, pantryProducts } from './db/schema';
import { eq } from 'drizzle-orm';
import { addPantry, adjustPantry, pantryData } from './pantry';
import { ageLabel, guessCategory, itemWarn } from '../logic/pantry';

const fresh = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};
const T = '2026-11-01';

describe('zapasy', () => {
	it('miejsca startowe z migracji', () => {
		expect(pantryData(fresh(), T).places.map((p) => [p.id, p.freezer])).toEqual([
			['spizarnia', false],
			['zamrazarka', true]
		]);
	});

	it('spiżarnia sumuje, zamrażarka trzyma partie; produkt zapamiętany i liczony', () => {
		const db = fresh();
		addPantry(db, { name: 'Pomidory w puszce', placeId: 'spizarnia', qty: 3, category: 'przetwory' }, T);
		addPantry(db, { name: 'pomidory w puszce', placeId: 'spizarnia', qty: 2 }, T);
		addPantry(db, { name: 'Mięso mielone', placeId: 'zamrazarka', qty: 2, date: '2026-04-01' }, T);
		addPantry(db, { name: 'Mięso mielone', placeId: 'zamrazarka', qty: 1 }, T);
		const d = pantryData(db, T);
		expect(d.items.filter((i) => i.placeId === 'spizarnia').map((i) => i.qty)).toEqual([5]);
		expect(d.items.filter((i) => i.placeId === 'zamrazarka').map((i) => [i.addedAt, i.qty, i.warn])).toEqual([
			['2026-04-01', 2, 'old'],
			[T, 1, null]
		]);
		expect(d.products.map((p) => [p.name, p.uses, p.category])).toEqual([
			['Mięso mielone', 2, 'mieso'],
			['Pomidory w puszce', 2, 'przetwory']
		]);
		expect(d.products.find((p) => p.name === 'Mięso mielone')!.icon).toBe('🥩');
		expect(d.summary).toEqual({ low: 0, warn: 1 });
	});

	it('gdy się skończy – do zakupów (raz); spiżarnia zostawia 0, zamrażarka usuwa partię', async () => {
		const db = fresh();
		const { itemId } = addPantry(db, { name: 'Mąka', placeId: 'spizarnia', qty: 1 }, T);
		expect(await adjustPantry(db, { itemId, delta: -1 })).toEqual({ shopping: 'Mąka' });
		expect(await adjustPantry(db, { itemId, delta: -1 })).toEqual({ shopping: null });
		expect(db.select().from(localShopping).all().filter((s) => s.name === 'Mąka')).toHaveLength(1);
		expect(pantryData(db, T).items.find((i) => i.id === itemId)!.qty).toBe(0);

		const fz = addPantry(db, { name: 'Pierogi', placeId: 'zamrazarka', qty: 1 }, T);
		await adjustPantry(db, { itemId: fz.itemId, delta: -1 });
		expect(pantryData(db, T).items.some((i) => i.id === fz.itemId)).toBe(false);
	});

	it('minimum: poniżej progu – do zakupów i licznik „mało”', async () => {
		const db = fresh();
		const { itemId, productId } = addPantry(db, { name: 'Ryż', placeId: 'spizarnia', qty: 3 }, T);
		db.update(pantryProducts).set({ minQty: 2 }).where(eq(pantryProducts.id, productId)).run();
		expect((await adjustPantry(db, { itemId, delta: -1 })).shopping).toBeNull(); // 3 → 2
		expect((await adjustPantry(db, { itemId, delta: -1 })).shopping).toBe('Ryż'); // 2 → 1
		expect(pantryData(db, T).summary.low).toBe(1);
	});

	it('walidacja i etykiety', () => {
		const db = fresh();
		expect(() => addPantry(db, { name: '', placeId: 'spizarnia' }, T)).toThrow('nazwę');
		expect(() => addPantry(db, { name: 'x', placeId: 'garaż' }, T)).toThrow('miejsce');
		expect(() => addPantry(db, { name: 'x', placeId: 'spizarnia', qty: 0 }, T)).toThrow('Ilość');
		expect(ageLabel('2026-08-01', T)).toBe('od 3 mies.');
		expect(ageLabel('2026-10-20', T)).toBe('od 12 dni');
		const place = { id: 's', name: 'S', icon: '', freezer: false };
		expect(itemWarn({ id: 1, productId: 1, placeId: 's', qty: 1, addedAt: T, bestBefore: '2026-11-05' }, place, T)).toBe('expiring');
		expect(itemWarn({ id: 1, productId: 1, placeId: 's', qty: 1, addedAt: T, bestBefore: '2026-10-30' }, place, T)).toBe('expired');
	});

	it('zgaduje kategorię po nazwie', () => {
		expect(['Pierogi ruskie', 'Udka z kurczaka', 'Mleko UHT', 'Pomidory w puszce', 'Kasza gryczana', 'Mieszanka warzyw', 'Papier toaletowy', 'Czekolada', 'Coś dziwnego'].map(guessCategory)).toEqual([
			'gotowe',
			'mieso',
			'nabial',
			'przetwory',
			'sypkie',
			'warzywa',
			'chemia',
			'slodycze',
			'inne'
		]);
	});
});
