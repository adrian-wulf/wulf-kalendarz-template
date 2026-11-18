import { asc } from 'drizzle-orm';
import { getDb } from '#lib/server/db/index.js';
import { members } from '#lib/server/db/schema.js';
import { phoneUser } from '#lib/server/whoami.js';
import { MEMBER_COOKIE } from '#lib/server/security.js';
import { localParts } from '#lib/logic/dates.js';
import { activeServers } from '#lib/modules/registry.server.js';
// --- 26b: guides ---
import { markPhoneSeen } from '#lib/server/checklist.js';

export function load({ locals, cookies }) {
	const db = getDb();
	// --- 26b: guides --- „Telefony domowników” na liście w panelu: strona telefonu otwarta spoza kiosku
	if (!locals.auth.kiosk && locals.auth.via) markPhoneSeen(db);
	// Login osoby tylko z Tailscale albo proxy; w trybie hasła sesja jest wspólna dla domu.
	const { login, member } = phoneUser(db, locals.auth.via === 'password' ? null : locals.auth.login);
	const all = db.select().from(members).orderBy(asc(members.sortOrder)).all();
	const chosen = cookies.get(MEMBER_COOKIE);
	return {
		login,
		autoMember: member?.id ?? null,
		/** wybór z tego telefonu (ciasteczko) – przed zapisem w localStorage */
		chosenMember: chosen && all.some((m) => m.id === chosen) ? chosen : null,
		/** tryb hasła: przycisk „Wyloguj” */
		canLogout: locals.auth.via === 'password',
		members: all.map(({ id, name, color, avatar }) => ({ id, name, color, avatar })),
		today: localParts(new Date()).date,
		/** aktywne moduły (zakładki na dole) */
		enabled: activeServers(db).map((m) => m.manifest.id),
		// --- 26b: guides --- puste stany: link do panelu tylko dla administratora
		isAdmin: !!locals.admin
	};
}
