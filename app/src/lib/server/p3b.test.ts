import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { eq } from 'drizzle-orm';
import { localShopping, members, settings } from './db/schema';
import { addPantry } from './pantry';
import { addMissing, mealsTile, missingFor, planRange, saveRecipe, seedMeals, setMeal } from './meals';
import { adjustPoints, decideRedemption, kidsState, kidsTile, requestReward, saveKidReward, saveKidTask, seedKids, toggleKidTask } from './kids';
import { countdownTile, saveCountdown, seedCountdowns } from './countdown';
import { InputError } from './store';

/** Posiłki, zadania dzieci i odliczanie na bazie w pamięci (bez Bring!). */

const fresh = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};
const T = '2026-11-12'; // czwartek
const setModules = (db: ReturnType<typeof fresh>, value: unknown) =>
	db.insert(settings).values({ key: 'modules', value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();

describe('posiłki', () => {
	it('wpis po nazwie: przepis albo sam tekst; pusty usuwa', () => {
		const db = fresh();
		const r = saveRecipe(db, { name: 'Pierogi', emoji: '🥟', ingredients: '1 kg mąka\n2 jajka' });
		expect(r.ingredients).toEqual([
			{ qty: 1, unit: 'kg', name: 'mąka' },
			{ qty: 2, unit: '', name: 'jajka' }
		]);
		setMeal(db, { date: T, slot: 'lunch', name: 'pierogi' });
		setMeal(db, { date: '2026-11-13', slot: 'lunch', name: 'Na mieście' });
		let days = planRange(db, T, 2, ['lunch']);
		expect(days.map((d) => [d.meals[0].name, d.meals[0].recipeId, d.meals[0].emoji])).toEqual([
			['Pierogi', r.id, '🥟'],
			['Na mieście', null, '🍽️']
		]);
		setMeal(db, { date: T, slot: 'lunch', name: '' });
		days = planRange(db, T, 1, ['lunch']);
		expect(days[0].meals[0].name).toBe('');
		expect(() => setMeal(db, { date: T, slot: 'brunch', name: 'x' })).toThrow(InputError);
		expect(() => saveRecipe(db, { name: 'pierogi' })).toThrow(InputError);
	});

	it('kafelek: pory z ustawień, 7 dni od dziś', () => {
		const db = fresh();
		seedMeals(db, T);
		expect(mealsTile(db, T).slots).toEqual(['lunch']);
		setModules(db, { meals: { config: { slots: 'both' } } });
		const tile = mealsTile(db, T);
		expect(tile.slots).toEqual(['lunch', 'dinner']);
		expect(tile.days).toHaveLength(7);
		expect(tile.days[0].meals.every((m) => m.name)).toBe(true);
	});

	it('brakujące: bez zapasów wszystko, z zapasami mniej; dopisanie z ilością na liście zakupów', async () => {
		const db = fresh();
		db.delete(localShopping).run();
		const r = saveRecipe(db, { name: 'Naleśniki', ingredients: '500 g mąka\n2 jajka\n1 l mleko' });
		setMeal(db, { date: T, slot: 'lunch', recipeId: r.id });
		setModules(db, { pantry: { enabled: false } });
		expect(missingFor(db, T).items.map((i) => [i.name, i.label])).toEqual([
			['jajka', '2'],
			['mąka', '500 g'],
			['mleko', '1 l']
		]);
		setModules(db, {});
		addPantry(db, { name: 'Jajka', placeId: 'spizarnia', qty: 10 }, T);
		addPantry(db, { name: 'Mleko', placeId: 'spizarnia', qty: 1 }, T); // „szt.” – inna jednostka, ale jest
		const m = missingFor(db, T);
		expect(m.usesPantry).toBe(true);
		expect(m.items.map((i) => i.name)).toEqual(['mąka']);
		const out = await addMissing(db, T, ['mąka', 'coś spoza listy']);
		expect(out.added).toEqual(['mąka']);
		expect(db.select().from(localShopping).all().map((s) => [s.name, s.spec])).toEqual([['mąka', '500 g']]);
		// Już na liście – drugi raz nie brakuje.
		expect(missingFor(db, T).items).toEqual([]);
	});
});

describe('zadania dzieci', () => {
	const setup = () => {
		const db = fresh();
		const a = saveKidTask(db, { memberId: 'ola', title: 'Łóżko', emoji: '🛏️', points: 2, repeat: 'daily' });
		const w = saveKidTask(db, { memberId: 'ola', title: 'Pokój', points: 5, repeat: 'weekly' });
		saveKidTask(db, { memberId: 'kuba', title: 'Zęby', points: 1, repeat: 'days', days: ['5'] }); // tylko piątek
		const reward = saveKidReward(db, { title: 'Kino', emoji: '🎬', cost: 6 });
		return { db, a, w, reward };
	};

	it('dziecko = domownik z zadaniami; odhaczenie i cofnięcie zmienia punkty', () => {
		const { db, a } = setup();
		const s = kidsState(db, T);
		expect(s.kids.map((k) => [k.memberId, k.total])).toEqual([
			['ola', 2],
			['kuba', 0]
		]);
		expect(toggleKidTask(db, { taskId: a.id }, T)).toEqual({ done: true, points: 2 });
		// jawne „zrobione” drugi raz – bez podwójnych punktów
		expect(toggleKidTask(db, { taskId: a.id, done: true }, T)).toEqual({ done: true, points: 2 });
		expect(toggleKidTask(db, { taskId: a.id }, T)).toEqual({ done: false, points: 0 });
		expect(() => toggleKidTask(db, { taskId: 999 }, T)).toThrow(InputError);
	});

	it('zadanie tygodniowe liczy się raz na tydzień', () => {
		const { db, w } = setup();
		toggleKidTask(db, { taskId: w.id }, '2026-11-09');
		expect(kidsState(db, T).kids[0].tasks.find((x) => x.id === w.id)?.done).toBe(true);
		expect(kidsState(db, '2026-11-16').kids[0].tasks.find((x) => x.id === w.id)?.done).toBe(false);
	});

	it('nagroda: rezerwacja punktów, zgoda odejmuje, odmowa zwraca, decyzja tylko raz', () => {
		const { db, a, w, reward } = setup();
		toggleKidTask(db, { taskId: a.id }, T);
		expect(() => requestReward(db, { memberId: 'ola', rewardId: reward.id })).toThrow(/4/);
		toggleKidTask(db, { taskId: w.id }, T);
		const req = requestReward(db, { memberId: 'ola', rewardId: reward.id });
		expect(kidsTile(db, T)).toMatchObject({ pending: 1, kids: [{ memberId: 'ola', points: 1 }, { memberId: 'kuba', points: 0 }] });
		// zarezerwowane – druga prośba się nie zmieści
		expect(() => requestReward(db, { memberId: 'ola', rewardId: reward.id })).toThrow(InputError);
		decideRedemption(db, { id: req.id, approve: true }, 'mama@example.com');
		expect(kidsTile(db, T).kids[0].points).toBe(1);
		expect(() => decideRedemption(db, { id: req.id, approve: false }, 'x')).toThrow(InputError);
		adjustPoints(db, { memberId: 'ola', delta: 9, reason: 'Pomoc' });
		const req2 = requestReward(db, { memberId: 'ola', rewardId: reward.id });
		decideRedemption(db, { id: req2.id, approve: 'false' }, 'tata@example.com');
		expect(kidsTile(db, T)).toMatchObject({ pending: 0, kids: [{ points: 10 }, { points: 0 }] });
		expect(() => requestReward(db, { memberId: 'tata', rewardId: reward.id })).toThrow(InputError);
	});

	it('walidacja zadań', () => {
		const db = fresh();
		expect(() => saveKidTask(db, { memberId: 'ola', title: 'x', points: 0, repeat: 'daily' })).toThrow(InputError);
		expect(() => saveKidTask(db, { memberId: 'ola', title: 'x', points: 1, repeat: 'days', days: [] })).toThrow(InputError);
		expect(() => saveKidTask(db, { memberId: 'nikt', title: 'x', points: 1, repeat: 'daily' })).toThrow(InputError);
		// wszystkie dni = codziennie
		expect(saveKidTask(db, { memberId: 'ola', title: 'x', points: 1, repeat: 'days', days: [1, 2, 3, 4, 5, 6, 7] }).repeat).toEqual({ type: 'daily' });
	});

	it('dane przykładowe: Ola z prośbą czekającą na zgodę', () => {
		const db = fresh();
		seedKids(db, T);
		seedKids(db, T); // bez dublowania
		const s = kidsState(db, T);
		expect(s.kids.map((k) => k.memberId)).toEqual(['ola', 'kuba']);
		expect(s.pending).toHaveLength(1);
		expect(s.rewards).toHaveLength(3);
	});
});

describe('odliczanie', () => {
	it('kafelek: najbliższe najpierw, przeszłe jednorazowe znikają, liczba z ustawień', () => {
		const db = fresh();
		saveCountdown(db, { title: 'Wigilia', emoji: '🎄', date: '2019-12-24', yearly: 'on' });
		saveCountdown(db, { title: 'Ferie', date: '2027-01-25' });
		saveCountdown(db, { title: 'Było', date: '2026-11-01' });
		const tile = countdownTile(db, T);
		expect(tile.show).toBe(3);
		expect(tile.items.map((c) => [c.title, c.next, c.days])).toEqual([
			['Wigilia', '2026-12-24', 42],
			['Ferie', '2027-01-25', 74]
		]);
		setModules(db, { countdown: { config: { count: 1 } } });
		expect(countdownTile(db, T).show).toBe(1);
		expect(() => saveCountdown(db, { title: 'x', date: '24.12.2026' })).toThrow(InputError);
		expect(() => saveCountdown(db, { title: '', date: T })).toThrow(InputError);
	});

	it('dane przykładowe', () => {
		const db = fresh();
		seedCountdowns(db, T);
		expect(countdownTile(db, T).items.map((c) => c.days)).toEqual([9, 42, 47]);
	});

	it('urodziny z profili domowników (ustawienie „Urodziny domowników”), bez dubli z własnym wpisem', () => {
		const db = fresh();
		seedCountdowns(db, T); // własne „Urodziny Oli” za 9 dni
		db.update(members).set({ birthday: '2018-11-21' }).where(eq(members.id, 'ola')).run();
		db.update(members).set({ birthday: '--11-14' }).where(eq(members.id, 'kuba')).run();
		const items = () => countdownTile(db, T).items.map((c) => [c.title, c.days]);
		expect(items()).toEqual([
			['Urodziny Kuby', 2],
			['Urodziny Oli', 9],
			['Wigilia', 42],
			['Wakacje nad morzem', 47]
		]);
		setModules(db, { countdown: { config: { birthdays: false } } });
		expect(items()).toEqual([
			['Urodziny Oli', 9],
			['Wigilia', 42],
			['Wakacje nad morzem', 47]
		]);
	});
});
