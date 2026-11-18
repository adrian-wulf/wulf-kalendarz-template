import calendar from './calendar/index.js';
import weather from './weather/index.js';
import holidays from './holidays/index.js';
import waste from './waste/index.js';
import shopping from './shopping/index.js';
import notes from './notes/index.js';
import chores from './chores/index.js';
import pantry from './pantry/index.js';
import snakes from './snakes/index.js';
import playground from './playground/index.js';
import birthdays from './birthdays/index.js';
import screensaver from './screensaver/index.js';
// --- p3b: meals, kids, countdown ---
import meals from './meals/index.js';
import kids from './kids/index.js';
import countdown from './countdown/index.js';
// --- p3c: care, transit, home assistant ---
import meds from './meds/index.js';
import care from './care/index.js';
import transit from './transit/index.js';
import homeassistant from './homeassistant/index.js';
import { withDefaults } from './settings.js';
import { t } from '#lib/i18n/index.js';
import type { ConfigOf, ModuleManifest, ModulesSetting, ModuleState, SettingsSchema } from './types.js';

/**
 * Rejestr modułów. Kolejność tutaj = kolejność domyślna (przyciski kiosku, kafelki, zakładki
 * telefonu, sekcje panelu); administrator może ją zmienić w panelu.
 */
export const MODULES = [calendar, weather, holidays, waste, shopping, notes, chores, pantry, snakes, playground, birthdays, screensaver, meals, kids, countdown, meds, care, transit, homeassistant] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

const byId = new Map<string, ModuleManifest<never>>(MODULES.map((m) => [m.id, m as ModuleManifest<never>]));

export function getModule(id: string): ModuleManifest<never> | undefined {
	return byId.get(id);
}

export const isModuleId = (id: string): id is ModuleId => byId.has(id);

/** Stan wszystkich modułów (posortowany) z zapisu `settings.modules`; brak zapisu = wartości domyślne. */
export function resolveModules(stored: ModulesSetting = {}): ModuleState[] {
	const list = MODULES.map((m, i) => {
		const s = stored[m.id];
		const core = 'core' in m && m.core;
		return {
			id: m.id as string,
			enabled: core ? true : (s?.enabled ?? m.defaultEnabled),
			order: core ? -1 : typeof s?.order === 'number' ? s.order : i * 10,
			defaultIndex: i
		};
	}).sort((a, b) => a.order - b.order || a.defaultIndex - b.defaultIndex);

	// Zależności: aktywny tylko, gdy włączony i wszystkie wymagane moduły są aktywne (także pośrednio).
	const active = new Map(list.map((m) => [m.id, m.enabled]));
	for (let changed = true; changed; ) {
		changed = false;
		for (const m of list) {
			const req = getModule(m.id)?.requires ?? [];
			if (active.get(m.id) && req.some((r) => !active.get(r))) {
				active.set(m.id, false);
				changed = true;
			}
		}
	}
	return list.map(({ id, enabled, order }) => ({
		id,
		enabled,
		active: !!active.get(id),
		missing: (getModule(id)?.requires ?? []).filter((r) => !active.get(r)),
		order
	}));
}

/** Aktywne moduły w kolejności z panelu. */
export function activeModules(states: ModuleState[]): ModuleManifest<never>[] {
	return states.filter((s) => s.active).map((s) => getModule(s.id)!);
}

/** Adresy wyłączonych modułów (strony, API i sekcja panelu) – na nie hooks.server.ts odpowiada 404. */
export function disabledRoutes(states: ModuleState[]): string[] {
	return states
		.filter((s) => !s.active)
		.flatMap((s) => {
			const m = getModule(s.id)!;
			return [...(m.routes ?? []), ...(m.admin ? [`/admin/${m.admin.slug}`] : [])];
		});
}

/** Czy adres należy do wyłączonego modułu (dokładnie prefiks albo prefiks + „/”). */
export function isPathDisabled(path: string, routes: readonly string[]): boolean {
	return routes.some((r) => path === r || path.startsWith(r.endsWith('/') ? r : `${r}/`));
}

/** Ostrzeżenia o zależnościach do pokazania w panelu. */
export function dependencyWarnings(states: ModuleState[]): string[] {
	return states
		.filter((s) => s.enabled && !s.active)
		.map((s) => {
			const m = getModule(s.id)!;
			const need = s.missing.map((r) => t('common.quoted', { text: getModule(r)?.name ?? r })).join(', ');
			return t('modules.needs', { name: m.name, need });
		});
}

/** Moduły, które przestaną działać po wyłączeniu `id` (do ostrzeżenia przy przełączniku). */
export function dependents(id: string): string[] {
	return MODULES.filter((m) => 'requires' in m && (m.requires as readonly string[]).includes(id)).map((m) => m.id);
}

/** Zapis po przesunięciu modułu o jedno miejsce w górę/dół (rdzeń zostaje na początku). */
export function reorder(stored: ModulesSetting, id: string, dir: 'up' | 'down'): ModulesSetting {
	const ids = resolveModules(stored)
		.filter((s) => !getModule(s.id)?.core)
		.map((s) => s.id);
	const i = ids.indexOf(id);
	const j = i + (dir === 'up' ? -1 : 1);
	if (i < 0 || j < 0 || j >= ids.length) return stored;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	const next: ModulesSetting = { ...stored };
	ids.forEach((m, k) => (next[m] = { ...next[m], order: (k + 1) * 10 }));
	return next;
}

export function setEnabled(stored: ModulesSetting, id: string, enabled: boolean): ModulesSetting {
	if (!byId.has(id) || getModule(id)?.core) return stored;
	return { ...stored, [id]: { ...stored[id], enabled } };
}

/** Ustawienia modułu: zapisane na wierzchu domyślnych ze schematu. */
export function moduleConfig<S extends SettingsSchema>(schema: S, stored: ModulesSetting, id: string): ConfigOf<S> {
	return withDefaults(schema, stored[id]?.config);
}

/** Manifesty modułów z listy `enabled` (np. `Dashboard.enabled`) – w tej kolejności. */
export const manifestsOf = (enabled: readonly string[]) => enabled.map(getModule).filter((m) => !!m);

/** Przyciski obok nawigacji tygodnia na kiosku. */
export const kioskLaunchers = (enabled: readonly string[]) => manifestsOf(enabled).filter((m) => m.kiosk?.launcher);

/** Kafelki na dole kiosku. */
export const kioskTiles = (enabled: readonly string[]) => manifestsOf(enabled).filter((m) => m.kiosk?.tile);

/** Zakładki wersji na telefon. */
export const phoneTabs = (enabled: readonly string[]) => manifestsOf(enabled).filter((m) => m.phone);

export type { ModuleManifest, ModuleState, ModulesSetting } from './types.js';
