import { appFetch } from './net.js';
import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { settings, sourceCache } from './db/schema.js';
import type { SourceStatus } from '#lib/types.js';
import { DEFAULT_SCHEDULE } from '#lib/logic/schedule.js';
import type { Fetcher, Source } from './sources/index.js';
import { DEFAULT_REGION, setRegion, type Region } from '#lib/region.js';
import { WASTE_PRESETS, type ManualPickup, type WasteRule } from '#lib/logic/waste.js';
import type { ModulesSetting } from '#lib/modules/types.js';
import { moduleSources, onModulesChange } from '#lib/modules/registry.server.js';
import { FRESH_STATE, type Language, type SetupState } from '#lib/setup.js';

export const DEFAULT_SETTINGS = {
	location: { lat: 52.37, lon: 9.74 } as { lat: number; lon: number; name?: string }, // przykład: Hannover – ustaw w panelu
	wasteIcalUrl: null as string | null,
	/** Treść pliku .ics wgranego w panelu (gdy dostawca nie ma stałego adresu). */
	wasteIcs: null as { name: string; text: string; uploadedAt: string } | null,
	/** Reguły pojemników; null = gotowy zestaw dla kraju z regionu. */
	wasteRules: null as WasteRule[] | null,
	/** Terminy wpisane ręcznie w panelu (gdy gmina nie daje kalendarza iCal). */
	wasteManual: [] as ManualPickup[],
	region: DEFAULT_REGION as Region,
	schedule: DEFAULT_SCHEDULE,
	// --- p4: security ---
	/** Usuwanie na kiosku (kartki, zapasy, węże, odliczania) tylko po PIN-ie – gdy PIN jest ustawiony. */
	pinOnDelete: false,
	/** Jasność ustawiona na kiosku „na teraz” – do zmiany pory dnia (najwyżej 12 h). */
	brightnessNow: null as { level: number; phase: string; until: string } | null,
	/** Włączenie, kolejność i ustawienia modułów; brak wpisu = domyślne z manifestu. */
	modules: {} as ModulesSetting,
	/**
	 * Kreator pierwszego uruchomienia: false = do zrobienia (kiosk przekierowuje na /setup),
	 * true = zrobiony, null = jeszcze nie ustalone (rozstrzyga `initSetup` przy starcie).
	 */
	setupDone: null as boolean | null,
	/** Krok kreatora, na którym skończono (wznowienie po restarcie). */
	setup: FRESH_STATE as SetupState,
	language: 'pl' as Language,
	/** Przykładowe wydarzenia i wywozy, dopóki nie ma prawdziwych źródeł; „Zacznij od pustego” wyłącza. */
	demoData: true
};

export type Settings = typeof DEFAULT_SETTINGS;

export function getSetting<K extends keyof Settings>(db: DB, key: K): Settings[K] {
	const row = db.select().from(settings).where(eq(settings.key, key)).get();
	return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}

export function setSetting<K extends keyof Settings>(db: DB, key: K, value: Settings[K]) {
	db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
	if (key === 'region') setRegion(value as Region);
}

/** Przy starcie: region (i strefa czasowa) z ustawień; nieprawidłowy zapis → domyślny. */
export function applyRegion(db: DB) {
	try {
		setRegion(getSetting(db, 'region'));
	} catch (e) {
		console.warn(`[region] ${e instanceof Error ? e.message : e} – używam domyślnego`);
		setRegion(DEFAULT_REGION);
	}
}

/** Reguły pojemników: zapisane w panelu albo gotowy zestaw dla kraju. */
export function wasteRules(db: DB): WasteRule[] {
	return getSetting(db, 'wasteRules') ?? WASTE_PRESETS[getSetting(db, 'region').country];
}

export function readCache<T>(db: DB, name: string): { data: T | null; status: SourceStatus } {
	const row = db.select().from(sourceCache).where(eq(sourceCache.source, name)).get();
	if (!row) return { data: null, status: { ok: false, fetchedAt: null } };
	const failedSinceSuccess = !!row.lastErrorAt && (!row.fetchedAt || row.lastErrorAt > row.fetchedAt);
	return {
		data: (row.data as T) ?? null,
		status: { ok: !failedSinceSuccess, fetchedAt: row.fetchedAt, error: failedSinceSuccess ? (row.lastError ?? undefined) : undefined }
	};
}

const WARN_EVERY_MS = 3_600_000;
const warned = new Map<string, { msg: string; at: number; repeats: number }>();

/**
 * Ten sam błąd źródła co minutę (ponowienia) zapychałby log na miesiące: pierwszy wpis od razu,
 * potem ten sam komunikat najwyżej raz na godzinę z liczbą powtórzeń. Nowy komunikat – od razu.
 * Repeated identical sync warnings: logged once, then at most hourly with a repeat count.
 */
export function warnOnce(name: string, msg: string, now = Date.now(), log: (s: string) => void = console.warn) {
	const w = warned.get(name);
	if (w && w.msg === msg && now - w.at < WARN_EVERY_MS) {
		w.repeats++;
		return;
	}
	const extra = w && w.msg === msg && w.repeats ? ` (powtórzone ${w.repeats}× w ciągu godziny)` : '';
	log(`[sync] ${name}: ${msg}${extra}`);
	warned.set(name, { msg, at: now, repeats: 0 });
}

/** Pobiera jedno źródło i zapisuje wynik albo błąd. Zwraca true przy sukcesie. */
export async function refresh<T>(db: DB, source: Source<T>, f: Fetcher = appFetch, now = new Date()): Promise<boolean> {
	try {
		const data = await source.fetch(f, now);
		const fetchedAt = now.toISOString();
		db.insert(sourceCache)
			.values({ source: source.name, data, fetchedAt })
			.onConflictDoUpdate({ target: sourceCache.source, set: { data, fetchedAt } })
			.run();
		if (warned.delete(source.name)) console.log(`[sync] ${source.name}: znowu działa`);
		return true;
	} catch (e) {
		const lastError = e instanceof Error ? e.message : String(e);
		const lastErrorAt = now.toISOString();
		db.insert(sourceCache)
			.values({ source: source.name, lastError, lastErrorAt })
			.onConflictDoUpdate({ target: sourceCache.source, set: { lastError, lastErrorAt } })
			.run();
		warnOnce(source.name, lastError, now.getTime());
		return false;
	}
}

/** Źródła aktywnych modułów (pogoda, ferie, śmieci, Google, Bring!…) – patrz `lib/modules`. */
export function activeSources(db: DB): Source<unknown>[] {
	return moduleSources(db);
}

const RETRY_MS = 60_000;

let kick: ((name: string) => void) | undefined;

// --- p4: backups ---
let paused = false;

/** Przywracanie kopii wstrzymuje pętlę synchronizacji (zaległe pobrania czekają na wznowienie). */
export function pauseSync(p: boolean) {
	paused = p;
}

/** Trwające pobrania – po nazwie źródła. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Jedno pobranie naraz dla klucza (nazwy źródła): drugie wywołanie w trakcie dostaje wynik
 * trwającego, zamiast startować równolegle. Źródła mogą na tym polegać (np. GTFS: jeden plik
 * `feed.zip.part` – pętla i „Odśwież teraz” nigdy nie piszą go naraz).
 *
 * Single-flight per key: a call while one is running joins it instead of running in parallel.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const running = inflight.get(key) as Promise<T> | undefined;
	if (running) return running;
	const p = fn().finally(() => {
		if (inflight.get(key) === p) inflight.delete(key);
	});
	inflight.set(key, p);
	return p;
}

/** Czy źródło jest właśnie pobierane. */
export const isRefreshing = (name: string) => inflight.has(name);

/** Natychmiastowe odświeżenie źródła (np. po zmianie ustawień w panelu). */
export async function refreshNow(db: DB, name: string): Promise<boolean> {
	if (paused) return false;
	// Trwa pobranie (pętla albo inne „teraz”) – czekamy na nie; ustawienia mogły się zmienić,
	// więc potem pobieramy jeszcze raz, ale nigdy równolegle.
	const running = inflight.get(name);
	if (running) await running.catch(() => {});
	const src = activeSources(db).find((s) => s.name === name);
	if (!src) return false;
	const ok = await singleFlight(name, () => refresh(db, src));
	kick?.(name);
	return ok;
}

/** Pętla synchronizacji: każde źródło we własnym rytmie, po błędzie ponowienie po minucie. */
export function startSync(db: DB): () => void {
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	// Pokolenie łańcucha na źródło: nowe zaplanowanie unieważnia stary łańcuch (także ten w trakcie pobierania).
	const gens = new Map<string, number>();
	let stopped = false;
	const schedule = (name: string, ms: number) => {
		clearTimeout(timers.get(name));
		if (stopped) return;
		const gen = (gens.get(name) ?? 0) + 1;
		gens.set(name, gen);
		const current = () => !stopped && gens.get(name) === gen;
		timers.set(
			name,
			setTimeout(async () => {
				if (!current()) return;
				if (paused) return schedule(name, 5_000);
				// Ustawienia mogły się zmienić – bierzemy aktualną definicję źródła.
				const src = activeSources(db).find((s) => s.name === name);
				if (!src) return void timers.delete(name);
				const ok = await singleFlight(name, () => refresh(db, src));
				// W międzyczasie „Odśwież teraz” zaplanowało od nowa – ten łańcuch się kończy.
				if (current()) schedule(name, ok ? src.intervalMs : RETRY_MS);
			}, ms)
		);
	};
	kick = (name) => {
		const src = activeSources(db).find((s) => s.name === name);
		if (src) schedule(name, src.intervalMs);
		else {
			clearTimeout(timers.get(name));
			timers.delete(name);
			gens.set(name, (gens.get(name) ?? 0) + 1);
		}
	};
	// Włączony moduł (albo nowo skonfigurowane źródło) – od razu do pętli.
	onModulesChange((db) => {
		for (const s of activeSources(db)) if (!timers.has(s.name)) schedule(s.name, 0);
	});
	for (const s of activeSources(db)) {
		const { status } = readCache(db, s.name);
		const age = status.fetchedAt ? Date.now() - Date.parse(status.fetchedAt) : Infinity;
		schedule(s.name, status.ok && age < s.intervalMs ? s.intervalMs - age : 0);
	}
	return () => {
		stopped = true;
		timers.forEach(clearTimeout);
		timers.clear();
	};
}
