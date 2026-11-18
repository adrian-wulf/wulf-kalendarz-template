import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { addChore, addEvent, addNote, addShopping, activeNotes, completeTask, InputError, wasteDoneKeys } from './store';
import { buildDashboard } from './dashboard';
import { suggestProducts } from '#lib/products.js';

const fresh = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};

describe('zapisy z kiosku', () => {
	it('wydarzenie z godziną w czasie Berlina i całodniowe', async () => {
		const db = fresh();
		expect(await addEvent(db, { title: 'Dentysta', memberId: 'mama', date: '2026-11-05', time: '15:00' })).toMatchObject({
			start: '2026-11-05T14:00:00.000Z',
			allDay: false
		});
		expect(await addEvent(db, { title: 'Wycieczka', memberId: null, date: '2026-11-07' })).toMatchObject({
			start: '2026-11-07',
			end: '2026-11-08',
			allDay: true
		});
	});

	it('odrzuca złe dane', async () => {
		const db = fresh();
		await expect(addEvent(db, { title: ' ', date: '2026-11-05' })).rejects.toThrow(InputError);
		await expect(addEvent(db, { title: 'x', memberId: 'obcy', date: '2026-11-05' })).rejects.toThrow(InputError);
		await expect(addEvent(db, { title: 'x', date: '5.11.2026' })).rejects.toThrow(InputError);
		await expect(addEvent(db, { title: 'x', date: '2026-11-05', time: '25:00' })).rejects.toThrow(InputError);
		await expect(addNote(db, { text: 'x', duration: 'forever' })).rejects.toThrow(InputError);
	});

	it('kartka znika po czasie', async () => {
		const db = fresh();
		const now = new Date('2026-10-31T13:00:00Z');
		await addNote(db, { text: 'Wrócę o 22', memberId: 'tata', duration: 'evening' }, now);
		expect(activeNotes(db, now).some((n) => n.text === 'Wrócę o 22')).toBe(true);
		expect(activeNotes(db, new Date('2026-10-31T22:30:00Z')).some((n) => n.text === 'Wrócę o 22')).toBe(false);
	});

	it('zakupy: ikona z katalogu i bez duplikatów', async () => {
		const db = fresh();
		const a = await addShopping(db, { name: 'pomidory' });
		expect(a.icon).toBe('🍅');
		expect((await addShopping(db, { name: 'Pomidory' })).id).toBe(a.id);
		expect(suggestProducts('ziem')[0].name).toBe('Ziemniaki');
		expect(suggestProducts('sol').map((p) => p.name)).toContain('Sól');
	});

	it('zadanie dodane i odhaczone znika z ekranu', () => {
		const db = fresh();
		const at = new Date('2026-11-03T10:00:00Z');
		const c = addChore(db, { title: 'Odkurzyć schody', memberId: null, date: '2026-11-03', repeat: 'weekly' });
		const key = `${c.id}:2026-11-03`;
		expect(buildDashboard(db, at).tasks.some((t) => t.key === key)).toBe(true);
		completeTask(db, key);
		expect(buildDashboard(db, at).tasks.some((t) => t.key === key)).toBe(false);
	});

	it('odhaczenie wystawienia pojemnika', () => {
		const db = fresh();
		completeTask(db, 'waste:2026-11-01:yellow');
		expect(wasteDoneKeys(db).has('waste:2026-11-01:yellow')).toBe(true);
		expect(() => completeTask(db, 'drop table')).toThrow(InputError);
	});
});
