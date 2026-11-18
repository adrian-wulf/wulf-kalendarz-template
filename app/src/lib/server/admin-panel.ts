import { error } from '@sveltejs/kit';
import type { DB } from './db/index.js';
import { act } from './act.js';
import { CORE_AFTER, CORE_BEFORE } from './admin-sections.js';
import { MODULES, getModule, type ModuleManifest } from '#lib/modules/index.js';
import { isActive, modulesSetting, moduleStates, saveModules, SERVERS } from '#lib/modules/registry.server.js';
import { parseConfig } from '#lib/modules/settings.js';
import type { AdminAction, AdminSection } from '#lib/modules/server-types.js';
import { t } from '#lib/i18n/index.js';
import { demoLockedAction, isDemo } from './demo/mode.js';

/** Sekcja panelu (`/admin/<slug>`): z rdzenia albo z modułu. */
export interface PanelSection extends AdminSection {
	module?: ModuleManifest<never>;
}

/** Sekcje modułów: z `admin` w manifeście; moduł z samymi ustawieniami dostaje prostą stronę `/admin/<id>`. */
function moduleSections(): PanelSection[] {
	return MODULES.flatMap((m): PanelSection[] => {
		const manifest = getModule(m.id)!;
		const admin = SERVERS[m.id].admin;
		// Etykiety jako gettery – czytane przy każdym żądaniu, w bieżącym języku.
		if (manifest.admin)
			return [
				{
					slug: manifest.admin.slug,
					get label() {
						return manifest.admin!.label;
					},
					load: admin?.load ?? (() => ({})),
					actions: admin?.actions ?? {},
					hidden: admin?.hidden,
					module: manifest
				}
			];
		if (manifest.settings)
			return [
				{
					slug: manifest.id,
					get label() {
						return manifest.name;
					},
					load: () => ({}),
					actions: {},
					module: manifest
				}
			];
		return [];
	});
}

/** Wszystkie sekcje (niezależnie od włączenia) – stała lista do akcji formularzy. */
export const ALL_SECTIONS: PanelSection[] = [...CORE_BEFORE, ...moduleSections(), ...CORE_AFTER];

/** Menu panelu: rdzeń + sekcje aktywnych modułów w kolejności z panelu. */
export function panelNav(db: DB) {
	const order = new Map(moduleStates(db).map((s, i) => [s.id, i]));
	const mods = ALL_SECTIONS.filter((s) => s.module && isActive(db, s.module.id as never)).sort(
		(a, b) => order.get(a.module!.id)! - order.get(b.module!.id)!
	);
	const list: PanelSection[] = [...CORE_BEFORE, ...mods, ...CORE_AFTER];
	return list
		.filter((s) => !s.hidden?.(db))
		.map((s) => ({ slug: s.slug, label: s.label }));
}

/** Sekcja do pokazania; nieznana albo wyłączonego modułu → 404. */
export function findSection(db: DB, slug: string): PanelSection {
	const s = ALL_SECTIONS.find((x) => x.slug === slug);
	if (!s || (s.module && !isActive(db, s.module.id as never))) error(404, t('admin.err.noSection'));
	return s;
}

/** Zapis ustawień modułu sekcji z formularza wygenerowanego ze schematu (`settings` w manifeście). */
const saveModuleConfig = (m: ModuleManifest<never>) =>
	act((f, db) => {
		const stored = modulesSetting(db);
		saveModules(db, { ...stored, [m.id]: { ...stored[m.id], config: parseConfig(m.settings!, f) } });
	}, 'moduleConfig');

/**
 * Akcje wszystkich sekcji pod jednym `/admin/[section]`. Każda działa tylko na stronie swojej sekcji
 * (i tylko gdy jej moduł jest aktywny), więc formularze zostają przy `action="?/nazwa"`.
 */
export function panelActions(getDb: () => DB): Record<string, (e: { request: Request; params: { section: string } }) => Promise<unknown>> {
	const out: Record<string, (e: { request: Request; params: { section: string } }) => Promise<unknown>> = {};
	const guard = (name: string, owner: (slug: string) => boolean, fn: AdminAction) => async (e: { request: Request; params: { section: string } }) => {
		const s = findSection(getDb(), e.params.section);
		if (!owner(s.slug)) error(404, t('admin.err.wrongSection'));
		// Demo: integracje (Google, Bring!, Home Assistant), kopie i dostęp tylko do podglądu.
		if (isDemo() && demoLockedAction(name)) error(403, t('demo.locked'));
		return fn(e);
	};
	for (const s of ALL_SECTIONS)
		for (const [name, fn] of Object.entries(s.actions)) {
			if (out[name]) throw new Error(`Akcja panelu „${name}” jest zdefiniowana dwa razy`);
			out[name] = guard(name, (slug) => slug === s.slug, fn);
		}
	out.saveModuleConfig = async (e) => {
		const s = findSection(getDb(), e.params.section);
		if (!s.module?.settings) error(404, t('admin.err.noSettings'));
		return saveModuleConfig(s.module)(e);
	};
	return out;
}
