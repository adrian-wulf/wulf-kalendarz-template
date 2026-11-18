/**
 * Ograniczanie prób (logowanie, PIN na kiosku, kod pierwszego uruchomienia): kilka pomyłek za darmo,
 * potem coraz dłuższa przerwa (podwajana do `maxMs`). Udana próba zeruje licznik.
 * Pamięć procesu – restart serwera czyści liczniki, ale restart też trwa.
 *
 * Attempt limiter with exponential backoff, per key (client address, "kiosk").
 */
export type ThrottleOptions = { free: number; baseMs: number; maxMs: number; forgetMs?: number; maxKeys?: number };

type Entry = { fails: number; until: number; last: number };

export class Throttle {
	private entries = new Map<string, Entry>();
	constructor(private readonly o: ThrottleOptions) {}

	/** Ile milisekund trzeba jeszcze czekać (0 = można próbować). */
	wait(key: string, now = Date.now()): number {
		const e = this.get(key, now);
		return e ? Math.max(0, e.until - now) : 0;
	}

	/** Zła próba – zwraca przerwę przed następną. */
	fail(key: string, now = Date.now()): number {
		const e = this.get(key, now) ?? { fails: 0, until: 0, last: now };
		e.fails += 1;
		e.last = now;
		const over = e.fails - this.o.free;
		const delay = over < 0 ? 0 : Math.min(this.o.maxMs, this.o.baseMs * 2 ** over);
		e.until = now + delay;
		this.entries.delete(key);
		this.entries.set(key, e);
		this.prune();
		return delay;
	}

	/** Pozostałe próby bez przerwy (dla komunikatu na kiosku). */
	left(key: string, now = Date.now()): number {
		return Math.max(0, this.o.free - (this.get(key, now)?.fails ?? 0));
	}

	success(key: string) {
		this.entries.delete(key);
	}

	/** Zwrot zarezerwowanej próby (udana próba przy liczniku wspólnym – nie zeruje go całego). */
	refund(key: string, now = Date.now()) {
		const e = this.get(key, now);
		if (!e) return;
		e.fails = Math.max(0, e.fails - 1);
		if (e.fails - this.o.free < 0) e.until = 0;
	}

	private get(key: string, now: number): Entry | undefined {
		const e = this.entries.get(key);
		if (e && now - e.last > (this.o.forgetMs ?? 60 * 60_000) && now >= e.until) {
			this.entries.delete(key);
			return undefined;
		}
		return e;
	}

	private prune() {
		const max = this.o.maxKeys ?? 5000;
		for (const key of this.entries.keys()) {
			if (this.entries.size <= max) break;
			this.entries.delete(key);
		}
	}
}
