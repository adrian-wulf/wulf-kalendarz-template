import { act } from '#lib/server/act.js';
import { localParts } from '#lib/logic/dates.js';
import * as K from '#lib/server/kids.js';
import { defineServer } from '../server-types.js';

const localToday = () => localParts(new Date()).date;

export default defineServer('kids', {
	seed: (db) => K.seedKids(db, localToday()),
	dashboard: ({ db, today }) => ({ data: K.kidsTile(db, today) }),
	admin: {
		load: (db, { today }) => ({
			kids: { ...K.kidsState(db, today), tasks: K.listKidTasks(db), history: K.kidHistory(db), decided: K.decidedRedemptions(db) }
		}),
		actions: {
			saveKidTask: act((f, db) => K.saveKidTask(db, f), 'kidTasks'),
			deleteKidTask: act((f, db) => K.deleteKidTask(db, f), 'kidTasks'),
			saveKidReward: act((f, db) => K.saveKidReward(db, f), 'kidRewards'),
			deleteKidReward: act((f, db) => K.deleteKidReward(db, f), 'kidRewards'),
			// Panel jest tylko dla administratorów (hooks.server.ts) – login z hooka (Tailscale, proxy, hasło).
			decideRedemption: async (e) => act((f, db) => K.decideRedemption(db, f, e.locals?.admin ?? 'admin'), 'kidRequests')(e),
			adjustKidPoints: act((f, db) => K.adjustPoints(db, f), 'kidPoints')
		}
	}
});
