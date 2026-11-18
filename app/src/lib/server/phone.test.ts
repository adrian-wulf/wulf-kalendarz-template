import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { members } from './db/schema';
import { eq } from 'drizzle-orm';
import { phoneUser } from './whoami';
import { activeNotes, addNote } from './store';
import { nextDue, upcomingChores } from '../logic/chores';

describe('telefon', () => {
	it('rozpoznaje domownika po e-mailu albo kalendarzu Google', () => {
		const db = openDb(':memory:');
		seed(db);
		db.update(members).set({ calendarIds: ['Anna@Example.com'] }).where(eq(members.id, 'mama')).run();
		db.update(members).set({ emails: ['tomek@example.com'] }).where(eq(members.id, 'wujek')).run();
		const h = (login?: string) => login ?? null;
		expect(phoneUser(db, h('anna@example.com')).member?.id).toBe('mama');
		expect(phoneUser(db, h('tomek@example.com')).member?.id).toBe('wujek');
		expect(phoneUser(db, h('obcy@example.com'))).toEqual({ login: 'obcy@example.com', member: null });
		expect(phoneUser(db, h()).login).toBeNull();
	});

	it('kartka do wybranego dnia wisi do 23:00; przeszłość odrzucona', async () => {
		const db = openDb(':memory:');
		seed(db);
		const now = new Date('2026-11-01T10:00:00Z');
		await addNote(db, { text: 'Do piątku', until: '2026-11-06' }, now);
		expect(activeNotes(db, new Date('2026-11-06T21:30:00Z')).some((n) => n.text === 'Do piątku')).toBe(true);
		expect(activeNotes(db, new Date('2026-11-06T22:30:00Z')).some((n) => n.text === 'Do piątku')).toBe(false);
		await expect(addNote(db, { text: 'x', until: '2026-10-30' }, now)).rejects.toThrow('przeszłości');
	});

	it('nadchodzące zadania: od jutra, bez odhaczonych', () => {
		const defs = [{ id: 1, title: 'Kwiaty', memberId: null, recurrence: { type: 'weekly' as const, days: [1, 4] }, startDate: '2026-10-01' }];
		const up = upcomingChores(defs, new Set(['1:2026-11-02']), '2026-11-01');
		expect(up.map((u) => u.dueDate)).toEqual(['2026-11-05']);
	});

	it('następny termin zadania pomija odhaczone dzisiejsze', () => {
		const c = { id: 2, title: 'Leki', memberId: null, recurrence: { type: 'weekly' as const, days: [7] }, startDate: '2026-01-01' };
		expect(nextDue(c, new Set(), '2026-11-01')).toBe('2026-11-01');
		expect(nextDue(c, new Set(['2:2026-11-01']), '2026-11-01')).toBe('2026-11-08');
		expect(nextDue({ ...c, recurrence: { type: 'once', date: '2026-10-30' } }, new Set(), '2026-11-01')).toBeNull();
	});
});
