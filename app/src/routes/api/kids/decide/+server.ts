import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { decideRedemption } from '#lib/server/kids.js';
import { kioskPinOk } from '#lib/server/kiosk-settings.js';
import { t } from '#lib/i18n/index.js';

/**
 * Zgoda albo odmowa rodzica: `{ id, approve }`. Z dostępem do panelu albo z kiosku po PIN-ie
 * (tylko gdy PIN jest ustawiony) – telefon dziecka i kiosk bez PIN-u tego nie zrobią.
 */
export const POST = ({ request, locals, cookies }) => {
	const db = getDb();
	const byKiosk = !locals.admin && locals.auth.kiosk && kioskPinOk(db, cookies, true);
	if (!locals.admin && !byKiosk) error(403, t('p3b.adminOnly'));
	return handle(request, (b) => decideRedemption(db, b, locals.admin ?? t('sec.byKiosk')));
};
