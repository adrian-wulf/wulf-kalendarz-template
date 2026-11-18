import { act } from '#lib/server/act.js';
import { localParts } from '#lib/logic/dates.js';
import * as M from '#lib/server/meds.js';
import { moduleConfig } from '../index.js';
import { defineServer } from '../server-types.js';
import { medsSettings } from './index.js';

export default defineServer('meds', {
	dashboard: ({ db, today, at, modules }) => ({ data: M.medsSummary(db, today, at, moduleConfig(medsSettings, modules, 'meds')) }),
	admin: {
		load: (db, { today }) => M.medsAdmin(db, today),
		actions: {
			saveMed: act((f, db) => M.saveMed(db, f, localParts(new Date()).date), 'meds'),
			deleteMed: act((f, db) => M.deleteMed(db, f), 'meds')
		}
	}
});
