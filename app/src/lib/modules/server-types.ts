import type { DB } from '#lib/server/db/index.js';
import type { Source } from '#lib/server/sources/index.js';
import type { CalEvent, SourceStatus, TaskItem } from '#lib/types.js';
import type { DataOf } from './data.js';
import type { ModulesSetting } from './types.js';

/** Chwila, dla której składamy ekran kiosku. */
export interface DashboardCtx {
	db: DB;
	at: Date;
	/** 'YYYY-MM-DD' w strefie regionu */
	today: string;
	/** minuty od północy */
	minutes: number;
	/** ostatni dzień zakresu (wyłącznie) */
	until: string;
	/** zapis `settings.modules` (np. do `moduleConfig`) */
	modules: ModulesSetting;
}

/** Wkład modułu do ekranu: własne dane i/lub wydarzenia, zadania, stan źródeł. */
export interface DashboardPart<T> {
	data?: T;
	events?: CalEvent[];
	tasks?: TaskItem[];
	status?: Record<string, SourceStatus>;
}

export interface AdminCtx {
	url: URL;
	today: string;
	modules: ModulesSetting;
}

/** Akcja formularza panelu – zwykle `act(fn, 'sekcja')`. */
export type AdminAction = (event: { request: Request; locals?: App.Locals }) => Promise<unknown>;

export interface AdminSection {
	slug: string;
	label: string;
	load: (db: DB, ctx: AdminCtx) => Record<string, unknown> | Promise<Record<string, unknown>>;
	/** nazwy muszą być unikalne w całym panelu (sprawdza test) */
	actions: Record<string, AdminAction>;
	/** ukryj w menu (np. lokalne wydarzenia po podłączeniu Google) – strona dalej działa */
	hidden?: (db: DB) => boolean;
}

/** Część serwerowa modułu. Wszystko opcjonalne. */
export interface ModuleServer<Id extends string = string> {
	/** dane startowe; musi być idempotentny (woła się przy starcie i po włączeniu modułu) */
	seed?: (db: DB) => void;
	/** źródła do pętli synchronizacji (tylko gdy moduł aktywny) */
	sources?: (db: DB) => Source<unknown>[];
	dashboard?: (ctx: DashboardCtx) => DashboardPart<DataOf<Id>>;
	/** sekcja panelu: dane i akcje formularzy (`slug` i `label` z manifestu) */
	admin?: Omit<AdminSection, 'slug' | 'label'>;
}

/** Część serwerowa z typami (typ danych sekcji panelu zostaje do użycia w komponencie). */
export const defineServer = <const Id extends string, S extends ModuleServer<Id>>(_id: Id, s: S) => s;

/** Dane strony sekcji panelu (wynik `admin.load`) – do typu `data` w komponencie sekcji. */
export type AdminDataOf<S> = S extends { admin?: { load: (...a: never[]) => infer R } } ? Awaited<R> : S extends { load: (...a: never[]) => infer R } ? Awaited<R> : never;
