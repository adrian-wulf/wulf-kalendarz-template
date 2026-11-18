import { getDb } from '#lib/server/db/index.js';
import { kidsState } from '#lib/server/kids.js';
import { localParts } from '#lib/logic/dates.js';

export function load({ locals }) {
	// Zgoda na nagrody bez PIN-u: wystarczy dostęp do panelu (ADMIN_LOGINS, proxy albo hasło).
	return { kids: kidsState(getDb(), localParts(new Date()).date), parent: !!locals.admin };
}
