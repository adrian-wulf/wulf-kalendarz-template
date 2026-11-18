import { choreCompletions, chores } from '#lib/server/db/schema.js';
import { seedDemoChores } from '#lib/server/db/seed.js';
import { act } from '#lib/server/act.js';
import * as A from '#lib/server/admin.js';
import { localParts } from '#lib/logic/dates.js';
import { completionKey, nextDue, occursOn, openChores } from '#lib/logic/chores.js';
import type { TaskItem } from '#lib/types.js';
import type { DB } from '#lib/server/db/index.js';
import { defineServer } from '../server-types.js';

const localToday = () => localParts(new Date()).date;
const doneKeys = (db: DB) => new Set(db.select().from(choreCompletions).all().map((c) => completionKey(c.choreId, c.dueDate)));

export default defineServer('chores', {
	seed: seedDemoChores,
	dashboard: ({ db, today }) => {
		const tasks: TaskItem[] = openChores(
			db.select().from(chores).all().filter((c) => !c.archived),
			doneKeys(db),
			today
		).map((c) => ({
			key: completionKey(c.choreId, c.dueDate),
			title: c.title,
			memberId: c.memberId,
			kind: 'chore',
			overdue: c.overdue
		}));
		return { tasks };
	},
	admin: {
		load: (db, { today }) => {
			const done = doneKeys(db);
			return {
				chores: A.listChores(db).map((c) => ({
					...c,
					next: nextDue(c, done, today),
					doneToday: occursOn(c.recurrence, c.startDate, today) && done.has(completionKey(c.id, today))
				}))
			};
		},
		actions: {
			saveChore: act((f, db) => A.saveChore(db, f, localToday()), 'chores'),
			deleteChore: act((f, db) => A.deleteChore(db, f), 'chores')
		}
	}
});
