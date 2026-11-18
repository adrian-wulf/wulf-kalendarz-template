import { afterEach, describe, expect, it, vi } from 'vitest';

// Jedno źródło z regulowanym czasem pobierania; licznik wywołań i równoległych pobrań.
let calls = 0;
let running = 0;
let maxRunning = 0;
let delay: (n: number) => number = (n) => (n === 1 ? 2000 : 100);
const src = {
	name: 'x',
	intervalMs: 10_000,
	fetch: async () => {
		calls++;
		running++;
		maxRunning = Math.max(maxRunning, running);
		await new Promise((r) => setTimeout(r, delay(calls)));
		running--;
		return {};
	}
};
vi.mock('#lib/modules/registry.server.js', () => ({ moduleSources: () => [src], onModulesChange: () => {} }));

import { openDb } from '#lib/server/db/index.js';
import { refreshNow, singleFlight, startSync } from '#lib/server/sync.js';

describe('pętla synchronizacji', () => {
	let stop: (() => void) | undefined;
	afterEach(() => {
		stop?.();
		vi.useRealTimers();
		calls = running = maxRunning = 0;
	});

	it('„Odśwież teraz” w trakcie zaplanowanego pobrania nie dubluje pętli', async () => {
		vi.useFakeTimers();
		const db = openDb(':memory:');
		stop = startSync(db);
		await vi.advanceTimersByTimeAsync(100); // pierwsze pobranie trwa 2 s
		const p = refreshNow(db, 'x');
		await vi.advanceTimersByTimeAsync(2500);
		await p;
		calls = 0;
		await vi.advanceTimersByTimeAsync(100_000);
		// co 10 s → ok. 10 pobrań, nie 18 (dwa łańcuchy)
		expect(calls).toBeGreaterThanOrEqual(9);
		expect(calls).toBeLessThanOrEqual(11);
		expect(maxRunning).toBe(1);
	});

	it('kilka „teraz” naraz – pobrania po kolei, nigdy równolegle', async () => {
		vi.useFakeTimers();
		delay = () => 500;
		const db = openDb(':memory:');
		stop = startSync(db);
		await vi.advanceTimersByTimeAsync(10);
		const all = Promise.all([refreshNow(db, 'x'), refreshNow(db, 'x'), refreshNow(db, 'x')]);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await all).toEqual([true, true, true]);
		expect(maxRunning).toBe(1);
		calls = 0;
		await vi.advanceTimersByTimeAsync(50_000);
		expect(calls).toBeLessThanOrEqual(6);
	});

	it('singleFlight: drugie wywołanie w trakcie dostaje ten sam wynik', async () => {
		let n = 0;
		const fn = () => new Promise<number>((r) => setTimeout(() => r(++n), 20));
		const [a, b] = await Promise.all([singleFlight('k', fn), singleFlight('k', fn)]);
		expect([a, b, n]).toEqual([1, 1, 1]);
		expect(await singleFlight('k', fn)).toBe(2);
	});
});

describe('ostrzeżenia synchronizacji', () => {
	it('ten sam błąd: pierwszy od razu, potem raz na godzinę z liczbą powtórzeń', async () => {
		const { warnOnce } = await import('#lib/server/sync.js');
		const log: string[] = [];
		const w = (msg: string, at: number) => warnOnce('pogoda-test', msg, at, (s) => log.push(s));
		const t0 = 1_000_000;
		for (let i = 0; i < 60; i++) w('HTTP 503', t0 + i * 60_000);
		expect(log).toEqual(['[sync] pogoda-test: HTTP 503']);
		w('HTTP 503', t0 + 3_600_000);
		expect(log[1]).toBe('[sync] pogoda-test: HTTP 503 (powtórzone 59× w ciągu godziny)');
		w('timeout', t0 + 3_600_001);
		expect(log[2]).toBe('[sync] pogoda-test: timeout');
	});
});
