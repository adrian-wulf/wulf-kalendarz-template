import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { kidPoints, kidRedemptions, kidRewards, kidTasks, members, type KidRepeat } from './db/schema.js';
import { InputError } from './store.js';
import { emoji, int, member, need, optId, raw, str, type Input } from './fields.js';
import { balances, canAfford, checkRepeat, doneKey, kidsDay, periodOf, type KidDay, type KidTask } from '#lib/logic/kids.js';
import type { KidsTile } from '#lib/modules/p3b-data.js';
import { t } from '#lib/i18n/index.js';

/** Zadania dzieci: punkty za odhaczone zadania, nagrody za punkty po zgodzie rodzica. */

export const listKidTasks = (db: DB): KidTask[] =>
	db
		.select()
		.from(kidTasks)
		.orderBy(asc(kidTasks.sortOrder), asc(kidTasks.id))
		.all();

/** Dzieci = domownicy z co najmniej jednym zadaniem, w kolejności domowników. */
export function kidIds(db: DB, tasks = listKidTasks(db)): string[] {
	const has = new Set(tasks.map((x) => x.memberId));
	return db
		.select({ id: members.id })
		.from(members)
		.orderBy(asc(members.sortOrder))
		.all()
		.map((m) => m.id)
		.filter((id) => has.has(id));
}

const doneKeys = (db: DB) =>
	new Set(
		db
			.select({ taskId: kidPoints.taskId, period: kidPoints.period })
			.from(kidPoints)
			.all()
			.flatMap((r) => (r.taskId !== null && r.period ? [doneKey(r.taskId, r.period)] : []))
	);

const pendingRows = (db: DB) => db.select().from(kidRedemptions).where(eq(kidRedemptions.status, 'pending')).orderBy(asc(kidRedemptions.requestedAt)).all();

/** Punkty do wydania (z odjętymi prośbami czekającymi na zgodę). */
export function kidBalances(db: DB) {
	return balances(
		db.select({ memberId: kidPoints.memberId, delta: kidPoints.delta }).from(kidPoints).all(),
		pendingRows(db)
	);
}

export const listRewards = (db: DB) => db.select().from(kidRewards).orderBy(asc(kidRewards.cost), asc(kidRewards.sortOrder)).all();

export interface KidView extends KidDay {
	name: string;
	color: string;
	points: number;
}

/** Wszystko dla okna kiosku i strony telefonu. */
export function kidsState(db: DB, today: string) {
	const tasks = listKidTasks(db);
	const ids = kidIds(db, tasks);
	const bal = kidBalances(db);
	const people = new Map(db.select().from(members).all().map((m) => [m.id, m]));
	const kids: KidView[] = kidsDay(ids, tasks, doneKeys(db), today).map((d) => ({
		...d,
		name: people.get(d.memberId)?.name ?? '?',
		color: people.get(d.memberId)?.color ?? '#888',
		points: bal.get(d.memberId) ?? 0
	}));
	return { today, kids, rewards: listRewards(db), pending: pendingRows(db) };
}

export function kidsTile(db: DB, today: string): KidsTile {
	const s = kidsState(db, today);
	return { kids: s.kids.map(({ memberId, points, done, total }) => ({ memberId, points, done, total })), pending: s.pending.length };
}

/**
 * Odhacza zadanie na dziś (albo cofa odhaczenie). Data zawsze z serwera – kiosk nie może
 * dopisać punktów za inne dni. Zwraca nowy stan i saldo dziecka.
 */
export function toggleKidTask(db: DB, input: Input, today: string, now = new Date()) {
	const id = optId(input, 'taskId');
	const task = id ? db.select().from(kidTasks).where(eq(kidTasks.id, id)).get() : undefined;
	if (!task) throw new InputError(t('kids.err.task'));
	const period = periodOf(task.repeat, today);
	const existing = db
		.select()
		.from(kidPoints)
		.where(and(eq(kidPoints.taskId, task.id), eq(kidPoints.period, period)))
		.get();
	// Jawne `done` (np. ponowne kliknięcie na telefonie) – bez zmiany, gdy już taki stan.
	const want = raw(input, 'done');
	const done = typeof want === 'boolean' ? want : !existing;
	if (done && !existing)
		db.insert(kidPoints).values({ memberId: task.memberId, delta: task.points, reason: `${task.emoji} ${task.title}`, taskId: task.id, period, createdAt: now.toISOString() }).run();
	if (!done && existing) db.delete(kidPoints).where(eq(kidPoints.id, existing.id)).run();
	return { done, points: kidBalances(db).get(task.memberId) ?? 0 };
}

/** Dziecko prosi o nagrodę – punkty są zarezerwowane, aż rodzic zdecyduje. */
export function requestReward(db: DB, input: Input, now = new Date()) {
	const memberId = member(db, input, 'memberId', true)!;
	if (!kidIds(db).includes(memberId)) throw new InputError(t('kids.err.notKid'));
	const rid = optId(input, 'rewardId');
	const reward = rid ? db.select().from(kidRewards).where(eq(kidRewards.id, rid)).get() : undefined;
	if (!reward) throw new InputError(t('kids.err.reward'));
	const balance = kidBalances(db).get(memberId) ?? 0;
	if (!canAfford(balance, reward.cost)) throw new InputError(t('kids.err.notEnough', { missing: reward.cost - balance }));
	return db
		.insert(kidRedemptions)
		.values({ memberId, rewardId: reward.id, title: reward.title, emoji: reward.emoji, cost: reward.cost, requestedAt: now.toISOString() })
		.returning()
		.get();
}

/** Zgoda albo odmowa rodzica. Zgoda zapisuje wydane punkty w księdze. `by` – login z Tailscale. */
export function decideRedemption(db: DB, input: Input, by: string, now = new Date()) {
	const id = optId(input, 'id');
	const row = id ? db.select().from(kidRedemptions).where(eq(kidRedemptions.id, id)).get() : undefined;
	if (!row) throw new InputError(t('kids.err.request'));
	if (row.status !== 'pending') throw new InputError(t('kids.err.decided'));
	const v = raw(input, 'approve');
	const approve = v === true || v === 'true' || v === '1' || v === 'on';
	db.transaction((tx) => {
		tx.update(kidRedemptions).set({ status: approve ? 'approved' : 'rejected', decidedAt: now.toISOString(), decidedBy: by }).where(eq(kidRedemptions.id, row.id)).run();
		if (approve)
			tx.insert(kidPoints).values({ memberId: row.memberId, delta: -row.cost, reason: `${row.emoji} ${row.title}`, createdAt: now.toISOString() }).run();
	});
	return { approved: approve };
}

/** Premia albo potrącenie od rodzica (panel). */
export function adjustPoints(db: DB, input: Input, now = new Date()) {
	const memberId = member(db, input, 'memberId', true)!;
	const delta = int(input, 'delta', t('kids.points'), -500, 500);
	if (delta === 0) throw new InputError(t('kids.err.zero'));
	const reason = str(input, 'reason').slice(0, 80) || (delta > 0 ? t('kids.bonus') : t('kids.penalty'));
	db.insert(kidPoints).values({ memberId, delta, reason, createdAt: now.toISOString() }).run();
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** Powtarzanie z formularza panelu (`repeat` + pola `days`) albo z JSON-a. */
function repeatOf(input: Input): KidRepeat {
	const type = str(input, 'repeat');
	const days = input instanceof FormData ? input.getAll('days') : raw(input, 'days');
	const r = checkRepeat({ type, days: Array.isArray(days) ? days : [] });
	if (!r) throw new InputError(type === 'days' ? t('kids.err.days') : t('kids.err.repeat'));
	if (r.type === 'days' && r.days.length === WEEKDAYS.length) return { type: 'daily' };
	return r;
}

export function saveKidTask(db: DB, input: Input) {
	const id = optId(input, 'id');
	const row = {
		memberId: member(db, input, 'memberId', true)!,
		title: need(input, 'title', t('kids.task'), 60),
		emoji: emoji(input, 'emoji', '⭐'),
		points: int(input, 'points', t('kids.points'), 1, 100),
		repeat: repeatOf(input)
	};
	if (id) return db.update(kidTasks).set(row).where(eq(kidTasks.id, id)).returning().get();
	const last = listKidTasks(db).at(-1);
	return db
		.insert(kidTasks)
		.values({ ...row, sortOrder: (last?.id ?? 0) + 1 })
		.returning()
		.get();
}

export const deleteKidTask = (db: DB, input: Input) => {
	const id = optId(input, 'id');
	if (id) db.delete(kidTasks).where(eq(kidTasks.id, id)).run();
};

export function saveKidReward(db: DB, input: Input) {
	const id = optId(input, 'id');
	const row = { title: need(input, 'title', t('kids.reward'), 60), emoji: emoji(input, 'emoji', '🎁'), cost: int(input, 'cost', t('kids.cost'), 1, 10000) };
	if (id) return db.update(kidRewards).set(row).where(eq(kidRewards.id, id)).returning().get();
	return db.insert(kidRewards).values(row).returning().get();
}

export const deleteKidReward = (db: DB, input: Input) => {
	const id = optId(input, 'id');
	if (id) db.delete(kidRewards).where(eq(kidRewards.id, id)).run();
};

/** Ostatnie wpisy księgi (panel). */
export function kidHistory(db: DB, limit = 40) {
	return db.select().from(kidPoints).orderBy(desc(kidPoints.createdAt), desc(kidPoints.id)).limit(limit).all();
}

/** Ostatnie decyzje o nagrodach (panel). */
export function decidedRedemptions(db: DB, limit = 20) {
	return db
		.select()
		.from(kidRedemptions)
		.where(inArray(kidRedemptions.status, ['approved', 'rejected']))
		.orderBy(desc(kidRedemptions.decidedAt))
		.limit(limit)
		.all();
}

/** Przykład: zadania dla Oli i Kuby (jeśli są wśród domowników), trzy nagrody, trochę punktów na start. */
export function seedKids(db: DB, today: string, now = new Date()) {
	if (db.select().from(kidRewards).all().length || db.select().from(kidTasks).all().length) return;
	db.insert(kidRewards)
		.values([
			{ title: t('demo.kids.reward1'), emoji: '📱', cost: 10 },
			{ title: t('demo.kids.reward2'), emoji: '🍦', cost: 15 },
			{ title: t('demo.kids.reward3'), emoji: '🎬', cost: 50 }
		])
		.run();
	const ids = new Set(db.select({ id: members.id }).from(members).all().map((m) => m.id));
	const at = now.toISOString();
	const tasks: (typeof kidTasks.$inferInsert)[] = [];
	if (ids.has('ola'))
		tasks.push(
			{ memberId: 'ola', title: t('demo.kids.task1'), emoji: '🛏️', points: 1, repeat: { type: 'daily' }, sortOrder: 1 },
			{ memberId: 'ola', title: t('demo.kids.task2'), emoji: '📚', points: 2, repeat: { type: 'days', days: [1, 2, 3, 4, 5] }, sortOrder: 2 },
			{ memberId: 'ola', title: t('demo.kids.task3'), emoji: '🧹', points: 5, repeat: { type: 'weekly' }, sortOrder: 3 }
		);
	if (ids.has('kuba'))
		tasks.push(
			{ memberId: 'kuba', title: t('demo.kids.task4'), emoji: '🪥', points: 1, repeat: { type: 'daily' }, sortOrder: 4 },
			{ memberId: 'kuba', title: t('demo.kids.task5'), emoji: '🧸', points: 1, repeat: { type: 'daily' }, sortOrder: 5 },
			{ memberId: 'kuba', title: t('demo.kids.task6'), emoji: '🌱', points: 2, repeat: { type: 'days', days: [3, 6] }, sortOrder: 6 }
		);
	if (!tasks.length) return;
	const rows = db.insert(kidTasks).values(tasks).returning().all();
	const start = (memberId: string, delta: number) => db.insert(kidPoints).values({ memberId, delta, reason: t('kids.bonus'), createdAt: at }).run();
	if (ids.has('ola')) {
		start('ola', 17);
		const first = rows.find((r) => r.memberId === 'ola')!;
		db.insert(kidPoints).values({ memberId: 'ola', delta: first.points, reason: `${first.emoji} ${first.title}`, taskId: first.id, period: periodOf(first.repeat, today), createdAt: at }).run();
		const reward = listRewards(db)[0];
		db.insert(kidRedemptions).values({ memberId: 'ola', rewardId: reward.id, title: reward.title, emoji: reward.emoji, cost: reward.cost, requestedAt: at }).run();
	}
	if (ids.has('kuba')) start('kuba', 6);
}
