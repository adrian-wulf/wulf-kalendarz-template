import { describe, expect, it } from 'vitest';
import { fmtQty, ingredientLine, missingIngredients, parseIngredient, parseIngredients, parseQty, sameProduct, slotsFor } from './meals';

describe('składniki z tekstu', () => {
	it('liczby: całe, z przecinkiem, ułamki', () => {
		expect([parseQty('2'), parseQty('0,5'), parseQty('1.5'), parseQty('1/2'), parseQty('½'), parseQty('1½'), parseQty('abc')]).toEqual([2, 0.5, 1.5, 0.5, 0.5, 1.5, null]);
	});

	it('ilość i jednostka z przodu, z tyłu albo wcale', () => {
		expect(parseIngredient('500 g mąki')).toEqual({ qty: 500, unit: 'g', name: 'mąki' });
		expect(parseIngredient('2 jajka')).toEqual({ qty: 2, unit: '', name: 'jajka' });
		expect(parseIngredient('½ l mleka')).toEqual({ qty: 0.5, unit: 'l', name: 'mleka' });
		expect(parseIngredient('2 EL Zucker')).toEqual({ qty: 2, unit: 'EL', name: 'Zucker' });
		expect(parseIngredient('200g Butter')).toEqual({ qty: 200, unit: 'g', name: 'Butter' });
		expect(parseIngredient('Mąka 500 g')).toEqual({ qty: 500, unit: 'g', name: 'Mąka' });
		expect(parseIngredient('Eggs 3')).toEqual({ qty: 3, unit: '', name: 'Eggs' });
		expect(parseIngredient('- sól')).toEqual({ qty: null, unit: '', name: 'sól' });
		expect(parseIngredient('   ')).toBeNull();
	});

	it('wiele linii (także średnik), z powrotem do tekstu', () => {
		const list = parseIngredients('500 g makaronu\n\n2 puszki pomidorów; bazylia');
		expect(list).toEqual([
			{ qty: 500, unit: 'g', name: 'makaronu' },
			{ qty: 2, unit: 'puszki', name: 'pomidorów' },
			{ qty: null, unit: '', name: 'bazylia' }
		]);
		expect(list.map(ingredientLine)).toEqual(['500 g makaronu', '2 puszki pomidorów', 'bazylia']);
		expect(fmtQty({ qty: 0.5, unit: 'l' })).toBe('½ l');
		expect(fmtQty({ qty: 1.25, unit: 'kg' })).toBe('1,25 kg');
	});

	it('pory posiłków z ustawienia', () => {
		expect(slotsFor('lunch')).toEqual(['lunch']);
		expect(slotsFor('dinner')).toEqual(['dinner']);
		expect(slotsFor('both')).toEqual(['lunch', 'dinner']);
		expect(slotsFor('xx')).toEqual(['lunch']);
	});

	it('ten sam produkt mimo odmiany', () => {
		expect(sameProduct('Mąka', 'mąki')).toBe(true);
		expect(sameProduct('pomidory', 'Pomidor')).toBe(true);
		expect(sameProduct('Eier', 'eier')).toBe(true);
		expect(sameProduct('mleko', 'mleczko')).toBe(false);
		expect(sameProduct('ser', 'sos')).toBe(false);
		expect(sameProduct('mąka', 'mąka pszenna')).toBe(false);
	});
});

describe('brakujące składniki', () => {
	const spaghetti = { date: '2026-11-12', recipe: 'Spaghetti', ingredients: parseIngredients('500 g makaron\n1 kg pomidory\nbazylia\n2 cebula') };
	const pizza = { date: '2026-11-13', recipe: 'Pizza', ingredients: parseIngredients('500 g pomidory\n0,5 kg mąka\ncebula') };

	it('bez zapasów: wszystko, ilości zsumowane (kg + g), cebula raz z ilością', () => {
		const m = missingIngredients([spaghetti, pizza], null, []);
		expect(m.map((x) => [x.name, x.qty, x.unit])).toEqual([
			['bazylia', null, ''],
			['cebula', 2, ''],
			['makaron', 500, 'g'],
			['mąka', 500, 'g'],
			['pomidory', 1.5, 'kg']
		]);
		expect(m.find((x) => x.name === 'pomidory')?.recipes).toEqual(['Spaghetti', 'Pizza']);
	});

	it('zapasy odejmują się w tej samej jednostce, inna jednostka = „jest w domu”', () => {
		const stock = [
			{ name: 'Pomidory', qty: 1, unit: 'kg' },
			{ name: 'Makaron', qty: 2, unit: 'op.' },
			{ name: 'Cebula', qty: 1, unit: 'szt.' },
			{ name: 'Bazylia', qty: 0, unit: 'szt.' }
		];
		const m = missingIngredients([spaghetti, pizza], stock, []);
		expect(m.map((x) => [x.name, x.qty, x.unit])).toEqual([
			['bazylia', null, ''],
			['cebula', 1, ''],
			['mąka', 500, 'g'],
			['pomidory', 500, 'g']
		]);
	});

	it('pomija to, co już jest na liście zakupów (też w innej formie)', () => {
		const m = missingIngredients([spaghetti], null, ['Pomidor', 'Makaronu', 'cebula']);
		expect(m.map((x) => x.name)).toEqual(['bazylia']);
	});

	it('nic nie brakuje, gdy wszystko jest', () => {
		const stock = [
			{ name: 'makaron', qty: 1000, unit: 'g' },
			{ name: 'pomidory', qty: 2, unit: 'kg' },
			{ name: 'bazylia', qty: 1, unit: 'szt.' },
			{ name: 'cebula', qty: 5, unit: 'szt.' }
		];
		expect(missingIngredients([spaghetti], stock, [])).toEqual([]);
	});
});
