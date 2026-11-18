import { act } from '#lib/server/act.js';
import { localParts } from '#lib/logic/dates.js';
import * as C from '#lib/server/countdown.js';
import { defineServer } from '../server-types.js';

const localToday = () => localParts(new Date()).date;

export default defineServer('countdown', {
	seed: (db) => C.seedCountdowns(db, localToday()),
	dashboard: ({ db, today }) => ({ data: C.countdownTile(db, today) }),
	admin: {
		load: (db, { today }) => ({ countdown: { list: C.listCountdowns(db), upcoming: C.countdownItems(db, today) } }),
		actions: {
			saveCountdown: act((f, db) => C.saveCountdown(db, f), 'countdown'),
			deleteCountdown: act((f, db) => C.deleteCountdown(db, f), 'countdown')
		}
	}
});
