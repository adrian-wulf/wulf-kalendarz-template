import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { restartSetup } from '#lib/server/setup.js';
import { InputError } from '#lib/server/store.js';
import { act } from '#lib/server/act.js';
import { readCache, refreshNow } from '#lib/server/sync.js';
import { dependencyWarnings, dependents, getModule, MODULES, reorder, setEnabled } from '#lib/modules/index.js';
import { modulesSetting, moduleStates, saveModules } from '#lib/modules/registry.server.js';
import { getLang, t } from '#lib/i18n/index.js';
import { isDemo } from '#lib/server/demo/mode.js';
import { loadSampleData, sampleDataLoaded } from '#lib/server/demo/load.js';
// --- 26b: guides ---
import { checklist, dismissTip, restoreTips } from '#lib/server/checklist.js';
import { localParts } from '#lib/logic/dates.js';

/** Przegląd: podgląd kiosku, moduły (włączanie, kolejność), status źródeł. */
export function load() {
	const db = getDb();
	const states = moduleStates(db);
	return {
		modules: states.map((s) => {
			const m = getModule(s.id)!;
			return {
				...s,
				name: m.name,
				icon: m.icon,
				description: m.description,
				core: !!m.core,
				requires: (m.requires ?? []).map((r) => getModule(r)?.name ?? r),
				dependents: dependents(s.id).map((d) => getModule(d)?.name ?? d),
				section: m.admin?.slug ?? (m.settings ? m.id : null)
			};
		}),
		warnings: dependencyWarnings(states),
		sources: states
			.filter((s) => s.active)
			.flatMap((s) => getModule(s.id)!.sources ?? [])
			.map((s) => ({ ...s, ...readCache(db, s.name).status })),
		sample: { loaded: sampleDataLoaded(db) },
		// --- 26b: guides --- „Co jeszcze możesz podłączyć”
		tips: checklist(db, localParts(new Date()).date)
	};
}

const known = (id: string) => {
	if (!MODULES.some((m) => m.id === id)) throw new InputError(t('admin.err.noModule'));
	return id;
};

export const actions = {
	toggleModule: act((f, db) => {
		saveModules(db, setEnabled(modulesSetting(db), known(String(f.get('id'))), f.get('enabled') === '1'));
	}, 'modules'),
	moveModule: act((f, db) => {
		saveModules(db, reorder(modulesSetting(db), known(String(f.get('id'))), f.get('dir') === 'up' ? 'up' : 'down'));
	}, 'modules'),
	refresh: act(async (f) => {
		const ok = await refreshNow(getDb(), String(f.get('name')));
		if (!ok) throw new InputError(t('admin.err.refresh'));
	}, 'status'),
	// --- 26b: guides --- ukrycie pozycji listy „Co jeszcze możesz podłączyć” i przywrócenie ukrytych
	dismissTip: act((f, db) => dismissTip(db, String(f.get('id') ?? '')), 'tips'),
	restoreTips: act((_, db) => restoreTips(db), 'tips'),
	/** Kreator jeszcze raz – kiosk przejdzie na /setup przy najbliższym odświeżeniu. */
	restartSetup: () => {
		if (isDemo()) error(403, t('demo.locked'));
		restartSetup(getDb());
		redirect(303, '/setup');
	},
	/** Dane przykładowe dopisane do istniejącej instalacji (nic nie usuwa). W demo – zbędne. */
	loadSampleData: async () => {
		if (isDemo()) return fail(403, { section: 'sample', error: t('demo.locked') });
		try {
			return { section: 'sample', ok: true, added: loadSampleData(getDb(), getLang()) };
		} catch (e) {
			if (e instanceof InputError) return fail(400, { section: 'sample', error: e.message });
			throw e;
		}
	}
};
