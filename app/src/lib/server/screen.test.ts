import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { InputError } from './store';
import { displayState, getScreen, parseScreen, saveScreen } from './screen';
import { setSetting } from './sync';
import { localTime } from '#lib/logic/dates.js';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return f;
};

const BASE = { eveningFrom: '21:00', nightFrom: '22:30', nightTo: '06:00', b_day: '90', b_evening: '40', b_night: '0', b_wake: '30' };

describe('panel: Ekran', () => {
	it('bez weekendu – jeden zestaw godzin i jasność', () => {
		expect(parseScreen(form(BASE))).toEqual({
			eveningFrom: '21:00',
			nightFrom: '22:30',
			nightTo: '06:00',
			brightness: { day: 90, evening: 40, night: 0, wake: 30 }
		});
	});

	it('z weekendem i walidacją', () => {
		const s = parseScreen(form({ ...BASE, weekendOn: 'on', we_eveningFrom: '22:00', we_nightFrom: '00:30', we_nightTo: '08:30' }));
		expect(s.weekend).toEqual({ eveningFrom: '22:00', nightFrom: '00:30', nightTo: '08:30' });
		expect(() => parseScreen(form({ ...BASE, weekendOn: 'on', we_eveningFrom: '25:00', we_nightFrom: '00:30', we_nightTo: '08:30' }))).toThrow(InputError);
		expect(() => parseScreen(form({ ...BASE, b_day: '5' }))).toThrow(InputError); // dzień nie może zgasić ekranu
		expect(() => parseScreen(form({ ...BASE, b_night: '101' }))).toThrow(InputError);
		expect(() => parseScreen(form({ ...BASE, nightTo: '' }))).toThrow(InputError);
	});

	it('/api/display: faza, jasność teraz i domyślne dla starego zapisu', () => {
		const db = openDb(':memory:');
		// stary zapis (bez jasności) – poziomy jak dotąd w agencie
		setSetting(db, 'schedule', { eveningFrom: '21:00', nightFrom: '23:00', nightTo: '06:00' });
		expect(getScreen(db).weekend).toBeNull();
		const evening = displayState(db, localTime('2026-11-12', 21, 30));
		expect(evening).toMatchObject({ phase: 'evening', level: 55, brightness: { day: 100, evening: 55, night: 0, wake: 40 } });
		expect(typeof evening.rotation).toBe('number');

		saveScreen(db, form({ ...BASE, weekendOn: 'on', we_eveningFrom: '22:00', we_nightFrom: '23:30', we_nightTo: '08:00' }));
		// piątek 23:00 – weekend: dopiero wieczór
		expect(displayState(db, localTime('2026-11-13', 23, 0))).toMatchObject({ phase: 'evening', level: 40 });
		// czwartek 23:00 – noc
		expect(displayState(db, localTime('2026-11-12', 23, 0))).toMatchObject({ phase: 'night', level: 0 });
		expect(displayState(db, localTime('2026-11-14', 12, 0))).toMatchObject({ phase: 'day', level: 90 });
	});
});
