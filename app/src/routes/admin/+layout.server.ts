import { getDb } from '#lib/server/db/index.js';
import { listMembers } from '#lib/server/admin.js';
import { panelNav } from '#lib/server/admin-panel.js';
import { localParts } from '#lib/logic/dates.js';
import { DEMO_PIN, demoResetTime, isDemo } from '#lib/server/demo/mode.js';
// --- 26b: guides ---
import { getSetting } from '#lib/server/sync.js';
import { googleRedirectUri } from '#lib/server/google.js';
import { publicOrigin } from '#lib/server/kiosk-settings.js';

/** Wspólne dla wszystkich stron panelu: menu (rdzeń + aktywne moduły), domownicy, dziś. */
export function load({ locals, url }) {
	const db = getDb();
	return {
		admin: locals.admin,
		nav: panelNav(db),
		members: listMembers(db),
		today: localParts(new Date()).date,
		/** tryb demo: baner w panelu i sekcje integracji tylko do podglądu */
		demo: isDemo() ? { reset: demoResetTime(), pin: DEMO_PIN } : null,
		// --- 26b: guides --- wariant przewodników (kraj, tryb logowania) i adresy wstawiane w kroki
		guide: {
			ctx: { country: getSetting(db, 'region').country, authMode: locals.authMode as string },
			params: { redirectUri: googleRedirectUri(url.origin), phoneUrl: `${publicOrigin() ?? url.origin}/telefon` }
		}
	};
}
