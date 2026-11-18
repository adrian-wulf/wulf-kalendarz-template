import type { Note, ShoppingItem, Weather } from '#lib/types.js';
import type { CountdownTile, KidsTile, MealsTile } from './p3b-data.js';
import type { ModuleManifest } from './types.js';
import type { UpcomingBirthday } from '#lib/logic/profiles.js';
import type { CareTileData, HaTileData, MedsTileData, TransitTileData } from './p3c.js';

/**
 * Dane, które moduł dokłada do ekranu kiosku (`Dashboard.modules[id]`).
 * Nowy moduł z danymi dopisuje tu swój wpis – reszta (dashboard, plakietka, kafelek) bierze typ stąd.
 */
export interface ModuleData {
	weather: Weather | null;
	holidays: { today: string | null };
	shopping: ShoppingItem[] | null;
	notes: Note[];
	/** plakietka na przycisku 🐍 */
	snakes: { due: number; lowFood: boolean };
	/** plakietka na przycisku 📦: produkty poniżej minimum i partie z ostrzeżeniem */
	pantry: { low: number; warn: number };
	/** najbliższe urodziny (odliczanie) i imieniny na dziś (tylko PL, null = nie pokazywać) */
	birthdays: { upcoming: UpcomingBirthday[]; namedays: { names: string[]; members: string[] } | null };
	/** wygaszacz: adresy zdjęć i ustawienia */
	screensaver: { photos: string[]; idleMinutes: number; slideSeconds: number; clock: boolean };
	// --- p3b: meals, kids, countdown ---
	meals: MealsTile;
	kids: KidsTile;
	countdown: CountdownTile;
	// --- p3c: care, transit, home assistant ---
	meds: MedsTileData;
	care: CareTileData;
	transit: TransitTileData;
	homeassistant: HaTileData;
}

export type DataOf<Id extends string> = Id extends keyof ModuleData ? ModuleData[Id] : undefined;

/** Manifest z typem danych wynikającym z identyfikatora. */
export const defineModule = <const Id extends string>(m: ModuleManifest<DataOf<Id>> & { id: Id }) => m;
