import { getDb } from '#lib/server/db/index.js';
import { localParts } from '#lib/logic/dates.js';
import { findSection, panelActions } from '#lib/server/admin-panel.js';
import { moduleConfig } from '#lib/modules/index.js';
import { modulesSetting } from '#lib/modules/registry.server.js';
// --- 26b: guides ---
import { GUIDES, SECTION_GUIDES } from '#lib/guides/index.js';
import { detectTips } from '#lib/server/checklist.js';

/** Podstrona panelu: sekcja rdzenia albo modułu (nieaktywny moduł → 404). */
export async function load({ params, url }) {
	const db = getDb();
	const s = findSection(db, params.section);
	const modules = modulesSetting(db);
	const today = localParts(new Date()).date;
	const m = s.module;
	// --- 26b: guides --- przewodniki nad sekcją ze stanem „działa / czego brak”
	const ids = SECTION_GUIDES[s.slug] ?? [];
	const tips = ids.length ? detectTips(db, today) : [];
	const guides = ids.map((id) => ({ id, state: tips.find((x) => x.id === GUIDES[id].tip)?.state ?? null }));
	return {
		guides,
		section: s.slug,
		label: s.label,
		module: m ? { id: m.id, name: m.name, icon: m.icon, description: m.description } : null,
		config: m?.settings ? moduleConfig(m.settings, modules, m.id) : null,
		...(await s.load(db, { url, today, modules }))
	};
}

export const actions = panelActions(getDb);
