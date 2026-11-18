import { fail } from '@sveltejs/kit';
import type { AdminSection } from '#lib/modules/server-types.js';
import { getDb, type DB } from './db/index.js';
import { InputError } from './store.js';
import { readCache, refreshNow } from './sync.js';
import { getRoles, isConnected } from './google.js';
import {
	createSubscription,
	deleteLayer,
	findLayer,
	layerColor,
	layerIcon,
	layerMember,
	layerName,
	layersLocked,
	localCalendars,
	localCounts,
	moveLayer,
	refreshMinutes,
	resolveLayers,
	setLayersLocked,
	swatchOf,
	upsertLayer,
	nextColor
} from './calendars.js';
import { fetchIcalText, IcalFetchError, normalizeIcalUrl } from './sources/subscription.js';
import { appFetch } from './net.js';
import { importIcs, previewIcs } from './ics-import.js';
import { listMembers } from './admin.js';
import { LAYER_ICONS, LAYER_PALETTE, REFRESH_CHOICES } from '#lib/calendars.js';
import { isDemo } from './demo/mode.js';
import { t } from '#lib/i18n/index.js';
import { localParts } from '#lib/logic/dates.js';

const todayOf = () => localParts(new Date()).date;

/**
 * Panel → Kalendarze: lista warstw (widoczność na kiosku i telefonie, kolor, ikona, osoba, kolejność),
 * subskrypcja linku iCal i import pliku .ics z podglądem.
 */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Jak `act`, ale z danymi w wyniku (podgląd importu) i z błędami pobierania jako komunikatem przy formularzu. */
const actData =
	(fn: (f: FormData, db: DB) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>, section: string) =>
	async ({ request }: { request: Request }) => {
		const f = await request.formData();
		try {
			return { section, ok: true, ...((await fn(f, getDb())) ?? {}) };
		} catch (e) {
			if (e instanceof InputError || e instanceof IcalFetchError) return fail(400, { section, error: e.message });
			throw e;
		}
	};

/** Zapis jednej warstwy z formularza wiersza (nazwa, kolor, ikona, osoba, widoczność, odświeżanie). */
function saveCalendar(db: DB, f: FormData) {
	const l = findLayer(db, str(f, 'id'));
	const patch: Parameters<typeof upsertLayer>[2] = {
		name: layerName(str(f, 'name'), l.kind === 'ical' || l.removable),
		color: layerColor(str(f, 'color')),
		icon: layerIcon(str(f, 'icon')),
		showKiosk: f.get('showKiosk') === 'on',
		showPhone: f.get('showPhone') === 'on'
	};
	// Nazwa równa domyślnej = domyślna (zmieni się z językiem).
	if (patch.name === l.defaultName) patch.name = '';
	if (!l.memberFromGoogle) patch.memberId = layerMember(db, str(f, 'memberId'));
	if (l.kind === 'ical') patch.refreshMinutes = refreshMinutes(str(f, 'refreshMinutes'));
	upsertLayer(db, l, patch);
}

/** Sam przełącznik widoczności (kiosk / telefon) – zapis od razu po kliknięciu. */
function toggleCalendar(db: DB, f: FormData) {
	const l = findLayer(db, str(f, 'id'));
	const on = str(f, 'on') === '1';
	if (str(f, 'surface') === 'phone') upsertLayer(db, l, { showPhone: on });
	else upsertLayer(db, l, { showKiosk: on });
}

/** Nowa subskrypcja: adres sprawdzany od razu (pobranie), żeby błąd było widać przy formularzu. */
async function addSubscription(db: DB, f: FormData) {
	const url = normalizeIcalUrl(str(f, 'url')).href;
	const name = layerName(str(f, 'name'), true);
	await fetchIcalText(appFetch, url);
	const id = createSubscription(db, {
		name,
		url,
		color: layerColor(str(f, 'color')),
		icon: layerIcon(str(f, 'icon')),
		memberId: layerMember(db, str(f, 'memberId')),
		refreshMinutes: refreshMinutes(str(f, 'refreshMinutes'))
	});
	await refreshNow(db, id);
	return { added: id };
}

export const calendarsSection = {
	slug: 'kalendarze',
	get label() {
		return t('cal.title');
	},
	load: (db: DB) => {
		const layers = resolveLayers(db);
		const list = listMembers(db);
		const counts = localCounts(
			db,
			layers.filter((l) => l.kind === 'local').map((l) => l.id)
		);
		return {
			calendars: layers.map((l) => {
				const status = l.kind === 'ical' ? readCache(db, l.id).status : null;
				return { ...l, swatch: swatchOf(l, list), status, count: l.kind === 'local' ? (counts[l.id] ?? 0) : null };
			}),
			locked: layersLocked(db),
			localTargets: localCalendars(db),
			googleConnected: isConnected(db),
			googleFamily: !!getRoles(db).family,
			palette: [...LAYER_PALETTE],
			icons: [...LAYER_ICONS],
			refreshChoices: [...REFRESH_CHOICES],
			suggestedColor: nextColor(db),
			demo: isDemo()
		};
	},
	actions: {
		saveCalendar: actData((f, db) => saveCalendar(db, f), 'calendars'),
		toggleCalendar: actData((f, db) => toggleCalendar(db, f), 'calendars'),
		moveCalendar: actData((f, db) => moveLayer(db, str(f, 'id'), str(f, 'dir') === 'up' ? 'up' : 'down'), 'calendars'),
		deleteCalendar: actData((f, db) => deleteLayer(db, str(f, 'id')), 'calendars'),
		refreshSubscription: actData(async (f, db) => {
			const l = findLayer(db, str(f, 'id'));
			if (l.kind !== 'ical') throw new InputError(t('cal.err.unknown'));
			if (!(await refreshNow(db, l.id))) throw new InputError(readCache(db, l.id).status.error ?? t('cal.err.network', { host: '' }));
		}, 'calendars'),
		addSubscription: actData((f, db) => addSubscription(db, f), 'calendarsAdd'),
		previewIcs: actData(async (f, db) => ({ preview: await previewIcs(db, f.get('file'), todayOf()) }), 'calendarsImport'),
		importIcs: actData((f, db) => ({ imported: importIcs(db, f, todayOf()) }), 'calendarsImport'),
		saveCalendarLock: actData((f, db) => setLayersLocked(db, f.get('locked') === 'on'), 'calendarsLock')
	}
} satisfies AdminSection;
