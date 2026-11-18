import { getDb } from '#lib/server/db/index.js';
import { getSetting } from '#lib/server/sync.js';
import { getTheme } from '#lib/server/theme.js';
import { getLayout } from '#lib/server/layout.js';
import { resolveTheme, themeCss } from '#lib/theme.js';
import { hasPin, pinOnDelete } from '#lib/server/security.js';

/** Region (strefa czasowa, święta), motyw i układ ekranu – wspólne dla kiosku, telefonu i panelu. */
export function load({ locals }) {
	const db = getDb();
	const theme = resolveTheme(getTheme(db));
	return {
		region: getSetting(db, 'region'),
		language: getSetting(db, 'language'),
		theme: { css: themeCss(theme), day: theme.day.bg, evening: theme.evening.bg },
		layout: getLayout(db),
		// --- p4: security --- tylko dla ekranu kiosku: czy pytać o PIN (ustawienia, usuwanie).
		kioskPin: locals.auth?.kiosk ? { set: hasPin(db), onDelete: hasPin(db) && pinOnDelete(db) } : null
	};
}
