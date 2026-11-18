import { describe, expect, it } from 'vitest';
import { openDb } from '.';
import { chores, members } from './schema';
import { seed } from './seed';
import { clashesWithBins, MEMBER_PALETTE } from '#lib/colors.js';
import { binColors, WASTE_PRESETS } from '#lib/logic/waste.js';

describe('baza danych', () => {
	it('migruje i wczytuje seed', () => {
		const db = openDb(':memory:');
		seed(db);
		seed(db); // drugi raz nic nie dubluje
		expect(db.select().from(members).all()).toHaveLength(6);
		const [prad] = db.select().from(chores).all();
		expect(prad.recurrence).toEqual({ type: 'monthly', day: 1 });
	});

	it('paleta domowników nie koliduje z kolorami pojemników z zestawów PL i DE', () => {
		for (const country of ['DE', 'PL'] as const) {
			const bins = binColors(WASTE_PRESETS[country]);
			for (const c of MEMBER_PALETTE) expect(clashesWithBins(c, bins), `${country} ${c}`).toBe(false);
			expect(clashesWithBins('#20a040', bins)).toBe(true);
		}
		expect(clashesWithBins('#20a040', ['#ff00ff'])).toBe(false);
	});
});
