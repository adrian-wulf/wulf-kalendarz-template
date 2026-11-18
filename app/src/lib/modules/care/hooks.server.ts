import { act } from '#lib/server/act.js';
import * as C from '#lib/server/care.js';
import { getSetting } from '#lib/server/sync.js';
import { localParts } from '#lib/logic/dates.js';
import { defineServer } from '../server-types.js';

const today = () => localParts(new Date()).date;

export default defineServer('care', {
	// Przykłady tylko przy danych przykładowych („Zacznij od pustego” – bez).
	seed: (db) => getSetting(db, 'demoData') && C.seedCare(db, today()),
	dashboard: ({ db, today }) => ({ data: C.careSummary(db, today) }),
	admin: {
		load: (db, { today }) => ({ care: C.careData(db, today), careHistory: C.careHistory(db) }),
		actions: {
			saveCareItem: act((f, db) => C.saveItem(db, f, today()), 'care'),
			deleteCareItem: act((f, db) => C.deleteItem(db, f), 'care'),
			markCareDone: act((f, db) => void C.markDone(db, Object.fromEntries(f), today()), 'care'),
			deleteCareLog: act((f, db) => C.deleteLog(db, f), 'care')
		}
	}
});
