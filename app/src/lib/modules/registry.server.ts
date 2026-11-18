import { eq } from 'drizzle-orm';
import type { DB } from '#lib/server/db/index.js';
import { members, settings } from '#lib/server/db/schema.js';
import type { Source } from '#lib/server/sources/index.js';
import { getSetting, setSetting } from '#lib/server/sync.js';
import calendar from './calendar/hooks.server.js';
import weather from './weather/hooks.server.js';
import holidays from './holidays/hooks.server.js';
import waste from './waste/hooks.server.js';
import shopping from './shopping/hooks.server.js';
import notes from './notes/hooks.server.js';
import chores from './chores/hooks.server.js';
import pantry from './pantry/hooks.server.js';
import snakes from './snakes/hooks.server.js';
import playground from './playground/hooks.server.js';
import birthdays from './birthdays/hooks.server.js';
import screensaver from './screensaver/hooks.server.js';
// --- p3b: meals, kids, countdown ---
import meals from './meals/hooks.server.js';
import kids from './kids/hooks.server.js';
import countdown from './countdown/hooks.server.js';
// --- p3c: care, transit, home assistant ---
import meds from './meds/hooks.server.js';
import care from './care/hooks.server.js';
import transit from './transit/hooks.server.js';
import homeassistant from './homeassistant/hooks.server.js';
import { activeModules, disabledRoutes, getModule, MODULES, resolveModules, type ModuleId, type ModulesSetting, type ModuleState } from './index.js';
import type { ModuleServer } from './server-types.js';

/** Część serwerowa każdego modułu z rejestru (`lib/modules/index.ts`). */
export const SERVERS: { [K in ModuleId]: ModuleServer<K> } = { calendar, weather, holidays, waste, shopping, notes, chores, pantry, snakes, playground, birthdays, screensaver, meals, kids, countdown, meds, care, transit, homeassistant };

export const modulesSetting = (db: DB): ModulesSetting => getSetting(db, 'modules');

export const moduleStates = (db: DB): ModuleState[] => resolveModules(modulesSetting(db));

export function isActive(db: DB, id: ModuleId): boolean {
	return !!moduleStates(db).find((s) => s.id === id)?.active;
}

/** Aktywne moduły (manifest + część serwerowa) w kolejności z panelu. */
export function activeServers(db: DB) {
	return activeModules(moduleStates(db)).map((m) => ({ manifest: m, server: SERVERS[m.id as ModuleId] as ModuleServer<ModuleId> }));
}

/** Źródła synchronizacji aktywnych modułów. */
export function moduleSources(db: DB): Source<unknown>[] {
	return activeServers(db).flatMap(({ server }) => server.sources?.(db) ?? []);
}

/** Prefiksy adresów wyłączonych modułów – patrz hooks.server.ts. */
export const blockedRoutes = (db: DB) => disabledRoutes(moduleStates(db));

export const SEEDED = 'seededModules';

/**
 * Dane startowe aktywnych modułów – każdy moduł raz na instalację (lista w `settings.seededModules`).
 * Istniejąca instalacja sprzed rejestru (są już domownicy) liczy się jako zasiana.
 * Póki trwa kreator (`setupDone === false`) – nic; dane przykładowe dodaje dopiero `finishSetup`.
 */
export function seedModules(db: DB) {
	// W trakcie kreatora pierwszego uruchomienia nic nie zasiewamy – o przykładach decyduje krok „Dane”.
	if (getSetting(db, 'setupDone') === false) return;
	const row = db.select().from(settings).where(eq(settings.key, SEEDED)).get();
	let done: string[];
	if (row) done = row.value as string[];
	else done = db.select().from(members).all().length ? MODULES.map((m) => m.id) : [];
	for (const { manifest, server } of activeServers(db)) {
		if (done.includes(manifest.id)) continue;
		server.seed?.(db);
		done = [...done, manifest.id];
	}
	db.insert(settings).values({ key: SEEDED, value: done }).onConflictDoUpdate({ target: settings.key, set: { value: done } }).run();
}

let onChange: ((db: DB) => void) | undefined;

/** Pętla synchronizacji rejestruje się tu, żeby po włączeniu modułu od razu pobrać jego źródła. */
export function onModulesChange(fn: (db: DB) => void) {
	onChange = fn;
}

/** Zapis włączenia/kolejności/ustawień modułów; nowo włączone moduły dostają seed i synchronizację. */
export function saveModules(db: DB, next: ModulesSetting) {
	setSetting(db, 'modules', next);
	seedModules(db);
	onChange?.(db);
}

export { getModule };
