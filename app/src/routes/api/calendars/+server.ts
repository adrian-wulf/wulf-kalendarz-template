import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { kioskPinOk } from '#lib/server/kiosk-settings.js';
import { layersLocked, setHiddenToday, showAllToday } from '#lib/server/calendars.js';
import { InputError } from '#lib/server/store.js';
import { localParts } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';

/**
 * Kiosk: szybkie ukrycie kalendarza do północy (`{ id, hidden }`) albo „pokaż wszystkie” (`{ all: true }`).
 * Bez PIN-u – chyba że w panelu włączono blokadę; wtedy tylko po PIN-ie (bez ustawionego PIN-u – wcale).
 * Na stałe ukrywa się w panelu → Kalendarze.
 */
export function POST({ request, locals, cookies }) {
	if (!locals.auth.kiosk) error(403, t('sec.kioskOnly'));
	const db = getDb();
	if (layersLocked(db) && !kioskPinOk(db, cookies, true)) error(403, t('cal.kiosk.locked'));
	return handle(request, (b) => {
		const today = localParts(new Date()).date;
		if (b.all === true) return void showAllToday(db);
		if (typeof b.id !== 'string' || typeof b.hidden !== 'boolean') throw new InputError(t('cal.err.unknown'));
		setHiddenToday(db, b.id, b.hidden, today);
	});
}
