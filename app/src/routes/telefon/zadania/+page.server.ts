import { getDb } from '#lib/server/db/index.js';
import { choreCompletions, chores } from '#lib/server/db/schema.js';
import { buildDashboard } from '#lib/server/dashboard.js';
import { completionKey, upcomingChores } from '#lib/logic/chores.js';

export function load() {
	const db = getDb();
	const d = buildDashboard(db, new Date());
	const done = new Set(db.select().from(choreCompletions).all().map((c) => completionKey(c.choreId, c.dueDate)));
	const upcoming = upcomingChores(
		db.select().from(chores).all().filter((c) => !c.archived),
		done,
		d.today
	).map((c) => ({ key: completionKey(c.choreId, c.dueDate), title: c.title, memberId: c.memberId, date: c.dueDate }));
	return { tasks: d.tasks, upcoming };
}
