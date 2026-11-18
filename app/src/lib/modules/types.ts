/**
 * Manifest modułu – tylko dane i czyste funkcje, bez importów serwerowych,
 * bo czytają go też kiosk i telefon w przeglądarce. Część serwerowa (seed, źródła
 * synchronizacji, dane dla ekranu, sekcja panelu) leży obok w `hooks.server.ts`.
 *
 * Module manifest: data and pure functions only (it is bundled for the browser too).
 */

/** Pole ustawień modułu: typ, etykieta i wartość domyślna (formularz w panelu powstaje z tego opisu). */
export type SettingsField =
	| { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number; hint?: string }
	| { type: 'boolean'; label: string; default: boolean; hint?: string }
	| { type: 'text'; label: string; default: string; maxLength?: number; pattern?: string; hint?: string }
	| { type: 'select'; label: string; default: string; options: readonly (readonly [value: string, label: string])[]; hint?: string };

export type SettingsSchema = Record<string, SettingsField>;

/** Typ wartości ustawień wynikający ze schematu. */
export type ConfigOf<S extends SettingsSchema> = {
	[K in keyof S]: S[K] extends { type: 'number' } ? number : S[K] extends { type: 'boolean' } ? boolean : string;
};

export interface LauncherBadge {
	text: string | number;
	/** czerwona zamiast pomarańczowej */
	warn?: boolean;
}

/** Kafelki na dole kiosku – każdy rodzaj ma swój widok, okno „wszystkie” i dodawanie. */
export type TileKind = 'shopping' | 'note' | 'chore' | 'meal' | 'kids' | 'countdown' | P3cTileKind;

// --- p3c: care, transit, home assistant ---
/** Kafelki modułów leki, opieka, odjazdy i Home Assistant (widok: `components/kiosk/ModuleTile.svelte`). */
export type P3cTileKind = 'meds' | 'care' | 'transit' | 'ha';

export interface ModuleManifest<Data = unknown> {
	id: string;
	/** klucz nazwy w słowniku (`lib/i18n`), np. `module.snakes` */
	nameKey: string;
	/** nazwa w bieżącym języku – w manifeście getter: `get name() { return t('module.snakes'); }` */
	name: string;
	icon: string;
	/** jedno zdanie do panelu */
	description: string;
	/** rdzeń – zawsze włączony, bez przełącznika */
	core?: boolean;
	defaultEnabled: boolean;
	/** moduły, bez których ten nie działa (np. zapasy → zakupy) */
	requires?: readonly string[];
	/**
	 * Prefiksy adresów należących do modułu (strony i `/api/...`). Gdy moduł jest wyłączony,
	 * `hooks.server.ts` odpowiada na nie 404. Sekcja panelu (`/admin/<slug>`) dochodzi sama.
	 */
	routes?: readonly string[];
	/** Źródła synchronizacji (nazwa w `source_cache` + etykieta do tabeli statusu). */
	sources?: readonly { name: string; label: string }[];
	kiosk?: {
		/** przycisk obok nawigacji tygodnia */
		launcher?: {
			href: string;
			label: string;
			/** pełne przeładowanie (strona spoza SvelteKit, np. gry) */
			reload?: boolean;
			badge?: (data: Data) => LauncherBadge | null;
		};
		/** kafelek na dole ekranu; `weight` = względna szerokość kolumny */
		tile?: { kind: TileKind; weight?: number };
	};
	/** zakładka w wersji na telefon: `/telefon/<path>` */
	phone?: { path: string; label: string };
	/** sekcja panelu: `/admin/<slug>` */
	admin?: { slug: string; label: string };
	/** ustawienia modułu (zapisywane w `settings.modules[id].config`) */
	settings?: SettingsSchema;
}

/** Zapis w tabeli ustawień: `settings.modules`. */
export type ModulesSetting = Partial<Record<string, { enabled?: boolean; order?: number; config?: Record<string, unknown> }>>;

/** Stan modułu po uwzględnieniu ustawień i zależności. */
export interface ModuleState {
	id: string;
	/** tak chce administrator */
	enabled: boolean;
	/** naprawdę działa: włączony i wszystkie zależności działają */
	active: boolean;
	/** brakujące (nieaktywne) zależności */
	missing: string[];
	order: number;
}
