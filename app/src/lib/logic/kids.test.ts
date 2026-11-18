import { describe, expect, it } from 'vitest';
import { balances, canAfford, checkRepeat, doneKey, kidsDay, kidTaskOn, periodOf, progress, weekStart, type KidTask } from './kids';

// 2026-11-12 to czwartek
const task = (id: number, memberId: string, repeat: KidTask['repeat'], points = 1): KidTask => ({ id, memberId, title: `t${id}`, emoji: '⭐', points, repeat });

describe('powtarzanie zadań dzieci', () => {
	it('codziennie, w wybrane dni, raz w tygodniu', () => {
		expect(kidTaskOn({ type: 'daily' }, '2026-11-12')).toBe(true);
		expect(kidTaskOn({ type: 'days', days: [1, 4] }, '2026-11-12')).toBe(true);
		expect(kidTaskOn({ type: 'days', days: [1, 4] }, '2026-11-13')).toBe(false);
		expect(kidTaskOn({ type: 'weekly' }, '2026-11-15')).toBe(true);
	});

	it('okres: dzień albo poniedziałek tygodnia (także przez przełom roku)', () => {
		expect(periodOf({ type: 'daily' }, '2026-11-12')).toBe('2026-11-12');
		expect(periodOf({ type: 'weekly' }, '2026-11-12')).toBe('2026-11-09');
		expect(periodOf({ type: 'weekly' }, '2026-11-15')).toBe('2026-11-09');
		expect(periodOf({ type: 'weekly' }, '2026-11-16')).toBe('2026-11-16');
		expect(weekStart('2027-01-01')).toBe('2026-12-28');
	});

	it('zadanie tygodniowe zrobione w poniedziałek nie wraca do niedzieli', () => {
		const tasks = [task(1, 'ola', { type: 'weekly' }, 5)];
		const done = new Set([doneKey(1, '2026-11-09')]);
		expect(kidsDay(['ola'], tasks, done, '2026-11-15')[0].done).toBe(1);
		expect(kidsDay(['ola'], tasks, done, '2026-11-16')[0].done).toBe(0);
	});

	it('postęp dnia i punkty do zdobycia', () => {
		const tasks = [task(1, 'ola', { type: 'daily' }, 2), task(2, 'ola', { type: 'days', days: [4] }, 3), task(3, 'ola', { type: 'days', days: [5] }), task(4, 'kuba', { type: 'daily' })];
		const [ola, kuba, ania] = kidsDay(['ola', 'kuba', 'ania'], tasks, new Set([doneKey(1, '2026-11-12')]), '2026-11-12');
		expect([ola.done, ola.total, ola.open]).toEqual([1, 2, 3]);
		expect(progress(ola)).toBe(0.5);
		expect([kuba.done, kuba.total]).toEqual([0, 1]);
		expect([ania.total, progress(ania)]).toEqual([0, 0]);
	});

	it('sprawdzanie zapisu powtarzania', () => {
		expect(checkRepeat({ type: 'days', days: ['3', 1, 9, 1] })).toEqual({ type: 'days', days: [1, 3] });
		expect(checkRepeat({ type: 'days', days: [] })).toBeNull();
		expect(checkRepeat({ type: 'weekly' })).toEqual({ type: 'weekly' });
		expect(checkRepeat({ type: 'yearly' })).toBeNull();
	});
});

describe('punkty i nagrody', () => {
	it('saldo = księga − prośby czekające na zgodę', () => {
		const b = balances(
			[
				{ memberId: 'ola', delta: 10 },
				{ memberId: 'ola', delta: 5 },
				{ memberId: 'ola', delta: -8 },
				{ memberId: 'kuba', delta: 3 }
			],
			[{ memberId: 'ola', cost: 4 }]
		);
		expect(b.get('ola')).toBe(3);
		expect(b.get('kuba')).toBe(3);
		expect(b.get('ania')).toBeUndefined();
	});

	it('stać mnie, gdy saldo ≥ koszt (koszt dodatni)', () => {
		expect(canAfford(10, 10)).toBe(true);
		expect(canAfford(9, 10)).toBe(false);
		expect(canAfford(5, 0)).toBe(false);
	});
});
