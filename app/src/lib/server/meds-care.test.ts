import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { members } from './db/schema';
import { deleteMed, medsAdmin, medsSummary, saveMed, takeDose, untakeDose } from './meds';
import { careData, careSummary, markDone, saveItem, seedCare, undoDone } from './care';
import { DEFAULT_WINDOW } from '#lib/logic/meds.js';

const form = (o: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
	return f;
};

function withMember() {
	const db = openDb(':memory:');
	db.insert(members).values({ id: 'mama', name: 'Mama', color: '#c2255c' }).run();
	return db;
}

describe('leki na serwerze', () => {
	it('zapis z panelu, walidacja, „wzięte” i cofnięcie, historia', () => {
		const db = withMember();
		expect(() => saveMed(db, form({ name: 'X', times: '8' }), '2026-11-01')).toThrow(/Godziny/);
		expect(() => saveMed(db, form({ name: '', times: '08:00' }), '2026-11-01')).toThrow();
		expect(() => saveMed(db, form({ name: 'X', times: '08:00', memberId: 'nikt' }), '2026-11-01')).toThrow();
		saveMed(db, form({ name: 'Witamina D', dose: '1 tabl.', times: '20:00, 8:00', memberId: 'mama', days: ['1', '2', '3', '4', '5', '6', '7'] }), '2026-11-01');
		const [m] = medsAdmin(db, '2026-11-12').meds;
		expect(m).toMatchObject({ name: 'Witamina D', times: ['08:00', '20:00'], active: true, memberId: 'mama' });

		const now = new Date('2026-11-12T07:10:00Z');
		expect(medsSummary(db, '2026-11-12', now, DEFAULT_WINDOW)).toMatchObject({ due: 2, overdue: 1 }); // 8:00 dziś + zaległa 20:00 z wczoraj
		expect(() => takeDose(db, { medId: m.id, time: '09:00' }, '2026-11-12')).toThrow(/godziny/);
		expect(() => takeDose(db, { medId: m.id, time: '08:00', date: '2026-11-01' }, '2026-11-12')).toThrow();
		const row = takeDose(db, { medId: m.id, time: '08:00' }, '2026-11-12', now)!;
		// drugi raz – ten sam wpis, bez dubla
		expect(takeDose(db, { medId: m.id, time: '08:00' }, '2026-11-12', now)!.id).toBe(row.id);
		takeDose(db, { medId: m.id, time: '20:00', date: '2026-11-11' }, '2026-11-12', now);
		const s = medsSummary(db, '2026-11-12', now, DEFAULT_WINDOW);
		expect(s.due).toBe(0);
		expect(s.doses.find((d) => d.time === '08:00')).toMatchObject({ state: 'taken', logId: row.id });
		expect(medsAdmin(db, '2026-11-13').meds[0].history[0]).toEqual({ date: '2026-11-12', planned: 2, taken: 1 });

		untakeDose(db, { id: row.id });
		expect(medsSummary(db, '2026-11-12', now, DEFAULT_WINDOW).due).toBe(1);
		expect(() => untakeDose(db, { id: row.id })).toThrow();

		// edycja bez „aktywny” = wstrzymany (znika z kiosku)
		saveMed(db, form({ id: String(m.id), name: 'Witamina D', times: '08:00' }), '2026-11-01');
		expect(medsSummary(db, '2026-11-12', now, DEFAULT_WINDOW).doses).toHaveLength(0);
		deleteMed(db, form({ id: String(m.id) }));
		expect(medsAdmin(db, '2026-11-12').meds).toHaveLength(0);
	});
});

describe('opieka na serwerze', () => {
	it('dodanie z „ostatnio”, odhaczenie, cofnięcie, okno', () => {
		const db = withMember();
		expect(() => saveItem(db, form({ name: 'Fikus', minDays: '7', maxDays: '3' }), '2026-11-12')).toThrow(/Odstęp/);
		saveItem(db, form({ name: 'Fikus', icon: '🌿', minDays: '7', maxDays: '10', lastDone: '2026-11-03' }), '2026-11-12');
		saveItem(db, form({ name: 'Filtr', minDays: '30', lastDone: '2026-11-12' }), '2026-11-12');
		const s = careSummary(db, '2026-11-12');
		expect(s.items.map((v) => [v.name, v.state])).toEqual([['Fikus', 'open']]);
		expect(s.next).toMatchObject({ name: 'Filtr', dueBy: '2026-12-12' });

		const fikus = s.items[0];
		const log = markDone(db, { id: fikus.id }, '2026-11-12', new Date('2026-11-12T10:00:00Z'));
		expect(careSummary(db, '2026-11-12').items).toHaveLength(0);
		expect(() => markDone(db, { id: fikus.id, date: '2026-11-13' }, '2026-11-12')).toThrow(); // przyszłość
		expect(() => undoDone(db, { logId: log.id }, new Date('2026-11-14T10:00:00Z'))).toThrow(/stary/);
		undoDone(db, { logId: log.id }, new Date('2026-11-12T10:01:00Z'));
		expect(careData(db, '2026-11-12').find((v) => v.id === fikus.id)).toMatchObject({ lastDone: '2026-11-03', state: 'open' });
	});

	it('przykłady raz na instalację', () => {
		const db = openDb(':memory:');
		seedCare(db, '2026-11-12');
		seedCare(db, '2026-11-12');
		expect(careData(db, '2026-11-12')).toHaveLength(4);
	});
});
