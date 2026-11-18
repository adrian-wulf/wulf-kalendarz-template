import type { DB } from '#lib/server/db/index.js';
import { getSetting, readCache, refreshNow, wasteRules } from '#lib/server/sync.js';
import { wasteSource } from '#lib/server/sources/index.js';
import { wasteDoneKeys } from '#lib/server/store.js';
import { demoPickups } from '#lib/server/demo.js';
import { act } from '#lib/server/act.js';
import * as A from '#lib/server/admin.js';
import { addDays } from '#lib/logic/dates.js';
import { bins, mergePickups, putOutTasks, WASTE_PRESETS, type Pickup } from '#lib/logic/waste.js';
import type { CalEvent, TaskItem } from '#lib/types.js';
import { defineServer } from '../server-types.js';
import { t as tr } from '#lib/i18n/index.js';
// --- 26b: guides ---
import * as W from '#lib/server/waste-admin.js';
import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { InputError } from '#lib/server/store.js';
import { localParts } from '#lib/logic/dates.js';

/** Wywozy z iCal i wpisane ręcznie; dopóki nie ma żadnego źródła – przykładowe. */
export function activePickups(db: DB, today: string, cached = readCache<Pickup[]>(db, 'waste').data): Pickup[] {
	const rules = wasteRules(db);
	const ical = getSetting(db, 'wasteIcalUrl') || getSetting(db, 'wasteIcs');
	const manual = getSetting(db, 'wasteManual');
	if (!ical && !manual.length) return getSetting(db, 'demoData') ? demoPickups(today, rules) : [];
	return mergePickups(ical ? (cached ?? []) : [], manual, rules);
}

function pickupEvents(pickups: Pickup[]): CalEvent[] {
	return pickups.map((p) => ({
		id: `waste-${p.date}-${p.kind}`,
		title: p.label,
		start: p.date,
		end: addDays(p.date, 1),
		allDay: true,
		memberId: null,
		kind: 'waste',
		bin: p.kind,
		binColor: p.color
	}));
}

export default defineServer('waste', {
	sources: (db) => {
		const url = getSetting(db, 'wasteIcalUrl');
		const file = getSetting(db, 'wasteIcs');
		if (url) return [wasteSource({ url }, wasteRules(db))];
		if (file) return [wasteSource({ text: file.text }, wasteRules(db))];
		return [];
	},
	dashboard: ({ db, today, minutes }) => {
		const waste = readCache<Pickup[]>(db, 'waste');
		const pickups = activePickups(db, today, waste.data);
		const putOut = putOutTasks(pickups, wasteDoneKeys(db), today, minutes);
		const tasks: TaskItem[] = putOut.map((t) => ({
			key: t.key,
			title: tr('waste.putOut', { bin: t.label }),
			memberId: null,
			kind: 'waste',
			bin: t.kind,
			binColor: t.color,
			overdue: false
		}));
		// W kolumnie „Dziś” przypomnienie o wystawieniu pojemnika (obok zadania do odhaczenia).
		const putOutEvents: CalEvent[] = putOut.map((t) => ({
			id: `putout-${t.key}`,
			title: t.pickupDate === today ? tr('waste.putOutToday', { bin: t.label }) : tr('waste.putOutEvening', { bin: t.label }),
			start: today,
			end: addDays(today, 1),
			allDay: true,
			memberId: null,
			kind: 'waste',
			bin: t.kind,
			binColor: t.color
		}));
		return { events: [...pickupEvents(pickups), ...putOutEvents], tasks, status: { waste: waste.status } };
	},
	admin: {
		load: (db, { today }) => {
			const rules = wasteRules(db);
			const file = getSetting(db, 'wasteIcs');
			return {
				wasteIcalUrl: getSetting(db, 'wasteIcalUrl'),
				wasteIcs: file && { name: file.name, uploadedAt: file.uploadedAt },
				rules,
				custom: getSetting(db, 'wasteRules') !== null,
				presets: Object.keys(WASTE_PRESETS),
				bins: bins(rules).map(({ bin, label, color }) => ({ bin, label, color })),
				manual: getSetting(db, 'wasteManual').filter((p) => p.date >= today),
				clashes: A.binClashes(db, rules),
				pickups: readCache<{ date: string; label: string }[]>(db, 'waste').data ?? [],
				upcoming: activePickups(db, today).filter((p) => p.date >= today)
			};
		},
		actions: {
			uploadWaste: act(async (f, db) => {
				await A.uploadWasteIcs(db, f);
				await refreshNow(db, 'waste');
			}, 'waste'),
			removeWaste: act((_, db) => A.removeWasteIcs(db), 'waste'),
			saveWasteRules: act(async (f, db) => {
				A.saveWasteRules(db, f);
				await refreshNow(db, 'waste');
			}, 'wasteRules'),
			loadWastePreset: act(async (f, db) => {
				A.loadWastePreset(db, f);
				await refreshNow(db, 'waste');
			}, 'wasteRules'),
			addManualPickup: act((f, db) => A.addManualPickup(db, f), 'wasteManual'),
			deleteManualPickup: act((f, db) => A.deleteManualPickup(db, f), 'wasteManual'),
			// --- 26b: guides --- cały rok naraz, usuwanie pojemnika, adres kalendarza w tej sekcji
			addManualPickups: async ({ request }: { request: Request }) => {
				const f = await request.formData();
				try {
					return { section: 'wasteYear', ok: true, added: W.addManualPickups(getDb(), f, localParts(new Date()).date) };
				} catch (e) {
					if (e instanceof InputError) return fail(400, { section: 'wasteYear', error: e.message });
					throw e;
				}
			},
			deleteManualBin: act((f, db) => W.deleteManualBin(db, f, localParts(new Date()).date), 'wasteManual'),
			saveWasteUrl: act(async (f, db) => {
				W.saveWasteUrl(db, f);
				await refreshNow(db, 'waste');
			}, 'wasteUrl')
		}
	}
});
