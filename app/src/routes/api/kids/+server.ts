import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { kidsState } from '#lib/server/kids.js';
import { getSetting } from '#lib/server/sync.js';
import { moduleConfig } from '#lib/modules/index.js';
import { kidsSettings } from '#lib/modules/kids/index.js';
import { localParts } from '#lib/logic/dates.js';

/** Stan dla okna kiosku: dzieci z zadaniami na dziś, saldo, nagrody, prośby. */
export const GET = () =>
	handle(null, () => {
		const db = getDb();
		return { ...kidsState(db, localParts(new Date()).date), celebrate: moduleConfig(kidsSettings, getSetting(db, 'modules'), 'kids').celebrate };
	});
