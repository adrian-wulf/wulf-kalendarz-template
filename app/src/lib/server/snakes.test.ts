import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { addSnakeEvent, adjustStock, removeSnakeEvent, saveSnake, seedSnakes, setPause, snakesData, snakesSummary } from './snakes';
import { agoLabel, feedInterval, feedLine, feedShort, intervalLabel, snakeView, untilLabel, type SnakeEvent } from '../logic/snakes';

const ev = (type: SnakeEvent['type'], dates: string[]): SnakeEvent[] => dates.map((date, i) => ({ id: i + 1, type, date, food: null, grams: null }));
const info = { id: 'x', name: 'X', species: 'Pyton', sex: 'F' as const, born: '2020', color: '#000000', intervalDays: null, intervalMax: null, pauseUntil: null };

describe('logika karmienia', () => {
	it('odstęp to mediana ostatnich przerw; za mało danych → null', () => {
		expect(feedInterval(ev('feed', ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-29']))).toBe(7);
		expect(feedInterval(ev('feed', ['2026-10-01', '2026-10-08']))).toBeNull();
	});

	it('termin, stan i odmowa przesuwająca próbę', () => {
		const feeds = ev('feed', ['2026-10-01', '2026-10-11', '2026-10-21']);
		expect(snakeView(info, feeds, '2026-10-25')).toMatchObject({ interval: 10, nextFeed: '2026-10-31', state: 'ok' });
		expect(snakeView(info, feeds, '2026-10-30').state).toBe('soon');
		expect(snakeView(info, feeds, '2026-11-02').state).toBe('due');
		const refused = [...feeds, { id: 9, type: 'refused' as const, date: '2026-10-31', food: null, grams: null }];
		expect(snakeView(info, refused, '2026-11-02')).toMatchObject({ nextFeed: '2026-11-10', state: 'ok', lastRefused: '2026-10-31' });
	});

	it('wstrzymanie i ręczny odstęp', () => {
		const feeds = ev('feed', ['2026-10-01', '2026-10-11', '2026-10-21']);
		expect(snakeView({ ...info, pauseUntil: '2026-11-05' }, feeds, '2026-11-01')).toMatchObject({ state: 'paused', nextFeed: '2026-11-05' });
		expect(snakeView({ ...info, intervalDays: 14 }, feeds, '2026-11-01')).toMatchObject({ interval: 14, intervalAuto: false, nextFeed: '2026-11-04' });
	});

	it('okno karmienia od–do: przed oknem, w oknie, po terminie', () => {
		const range = { ...info, intervalDays: 21, intervalMax: 28 };
		const feeds = ev('feed', ['2026-10-01']);
		const before = snakeView(range, feeds, '2026-10-15');
		expect(before).toMatchObject({ nextFeed: '2026-10-22', dueBy: '2026-10-29', state: 'ok' });
		expect(feedLine(before, '2026-10-15')).toBe('Karmienie za 7–14 dni');
		expect(intervalLabel(before)).toBe('co 3–4 tyg.');
		const inWin = snakeView(range, feeds, '2026-10-25');
		expect(inWin.state).toBe('soon');
		expect(feedLine(inWin, '2026-10-25')).toBe('Można karmić · najpóźniej za 4 dni');
		expect(feedShort(inWin, '2026-10-25')).toBe('można · do 29.10');
		const late = snakeView(range, feeds, '2026-11-01');
		expect(late.state).toBe('due');
		expect(feedLine(late, '2026-11-01')).toBe('Karmienie 3 dni po terminie');
		expect(intervalLabel(snakeView({ ...info, intervalDays: 7, intervalMax: 10 }, feeds, '2026-10-02'))).toBe('co 7–10 dni');
	});

	it('etykiety po polsku', () => {
		expect(agoLabel('2026-10-31', '2026-11-01')).toBe('wczoraj');
		expect(agoLabel('2026-10-24', '2026-11-01')).toBe('8 dni temu');
		expect(untilLabel('2026-11-02', '2026-11-01')).toBe('jutro');
		expect(untilLabel('2026-10-29', '2026-11-01')).toBe('3 dni po terminie');
	});
});

describe('węże w bazie', () => {
	it('dane przykładowe: 4 węże, regularna historia liczona od dziś, zapas', () => {
		const db = openDb(':memory:');
		seedSnakes(db, '2026-11-01');
		seedSnakes(db, '2026-11-01'); // drugi raz nic nie dubluje
		const d = snakesData(db, '2026-11-01');
		expect(d.snakes.map((s) => s.name)).toEqual(['Sezam', 'Rumba', 'Tofu', 'Pestka']);
		expect(d.snakes.map((s) => s.state)).toEqual(['ok', 'soon', 'due', 'ok']);
		const tofu = d.snakes.find((s) => s.id === 'tofu')!;
		expect(tofu).toMatchObject({ lastFeed: '2026-10-15', lastShed: '2026-09-29', interval: 14 });
		expect(d.snakes.find((s) => s.id === 'sezam')!.events.filter((e) => e.type === 'feed')).toHaveLength(12);
		expect(d.food.find((f) => f.id === '30g')).toMatchObject({ count: 0 });
		expect(snakesSummary(db, '2026-11-01')).toEqual({ due: 1, lowFood: true });
	});

	it('dane przykładowe idą za dniem startu', () => {
		const db = openDb(':memory:');
		seedSnakes(db, '2027-03-10');
		expect(snakesData(db, '2027-03-10').snakes.find((s) => s.id === 'sezam')!.lastFeed).toBe('2027-03-06');
	});

	it('karmienie zdejmuje karmówkę, cofnięcie ją oddaje, karmienie kończy wstrzymanie', () => {
		const db = openDb(':memory:');
		seedSnakes(db, '2026-11-01');
		setPause(db, { snakeId: 'rumba', until: '2026-11-20' });
		const row = addSnakeEvent(db, { snakeId: 'rumba', type: 'feed', food: '50g' }, '2026-11-01');
		let d = snakesData(db, '2026-11-01');
		expect(d.food.find((f) => f.id === '50g')!.count).toBe(2);
		expect(d.snakes.find((s) => s.id === 'rumba')).toMatchObject({ lastFeed: '2026-11-01', lastFood: '50g', pauseUntil: null });
		removeSnakeEvent(db, row.id);
		d = snakesData(db, '2026-11-01');
		expect(d.food.find((f) => f.id === '50g')!.count).toBe(3);
		expect(d.snakes.find((s) => s.id === 'rumba')!.lastFeed).toBe('2026-10-26');
	});

	it('zapas nie schodzi poniżej zera; złe dane → błąd', () => {
		const db = openDb(':memory:');
		seedSnakes(db);
		adjustStock(db, { food: '30g', delta: -1 });
		expect(snakesData(db, '2026-11-01').food.find((f) => f.id === '30g')!.count).toBe(0);
		expect(() => addSnakeEvent(db, { snakeId: 'nikt', type: 'feed' }, '2026-11-01')).toThrow('Nieznany wąż');
		expect(() => addSnakeEvent(db, { snakeId: 'rumba', type: 'weight', grams: 'dużo' }, '2026-11-01')).toThrow('Waga');
		addSnakeEvent(db, { snakeId: 'rumba', type: 'weight', grams: 412 }, '2026-11-01');
		expect(snakesData(db, '2026-11-01').snakes.find((s) => s.id === 'rumba')!.lastWeight).toEqual({ date: '2026-11-01', grams: 412 });
	});

	it('kolor węża z panelu: zapis i walidacja; dane startowe mają różne kolory', () => {
		const db = openDb(':memory:');
		seedSnakes(db);
		expect(new Set(snakesData(db, '2026-11-01').snakes.map((s) => s.color)).size).toBe(4);
		const form = (color: string) => {
			const f = new FormData();
			Object.entries({ id: 'rumba', name: 'Rumba', species: 'Wąż zbożowy', sex: 'M', born: '2022', color }).forEach(([k, v]) => f.set(k, v));
			return f;
		};
		saveSnake(db, form('#12AB34'));
		expect(snakesData(db, '2026-11-01').snakes.find((s) => s.id === 'rumba')!.color).toBe('#12ab34');
		expect(() => saveSnake(db, form('zielony'))).toThrow('Zły kolor');
	});
});
