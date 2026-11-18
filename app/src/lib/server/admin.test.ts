import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { InputError } from './store';
import { addManualPickup, binClashes, deleteManualPickup, loadWastePreset, saveMember, saveRegion, saveWasteRules } from './admin';
import { getSetting, wasteRules } from './sync';
import { buildDashboard } from './dashboard';
import { DEFAULT_REGION, getRegion, setRegion } from '#lib/region.js';
import { localZone } from '#lib/logic/dates.js';

const fresh = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};
const form = (entries: [string, string][]) => {
	const f = new FormData();
	for (const [k, v] of entries) f.append(k, v);
	return f;
};

afterEach(() => setRegion(DEFAULT_REGION));

describe('panel: region', () => {
	it('domyślnie DE / Dolna Saksonia / Berlin', () => {
		expect(getSetting(fresh(), 'region')).toEqual({ country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin' });
	});

	it('zapis regionu PL zmienia strefę, święta i zestaw pojemników', () => {
		const db = fresh();
		saveRegion(db, form([['country', 'PL'], ['subdivision', 'PL-MZ'], ['timezone', 'Europe/Warsaw']]));
		expect(getRegion()).toEqual({ country: 'PL', subdivision: 'PL-MZ', timezone: 'Europe/Warsaw' });
		expect(localZone()).toBe('Europe/Warsaw');
		expect(wasteRules(db)[0].bin).toBe('metale');
		expect(buildDashboard(db, new Date('2026-11-11T10:00:00Z')).modules.holidays?.today).toBe('Święto Niepodległości');
	});

	it('odrzuca land spoza kraju i nieznaną strefę', () => {
		const db = fresh();
		expect(() => saveRegion(db, form([['country', 'PL'], ['subdivision', 'DE-NI'], ['timezone', 'Europe/Warsaw']]))).toThrow('województwo');
		expect(() => saveRegion(db, form([['country', 'DE'], ['subdivision', 'DE-BY'], ['timezone', 'Mars/Olympus']]))).toThrow(InputError);
		expect(() => saveRegion(db, form([['country', 'FR'], ['subdivision', 'FR-75'], ['timezone', 'Europe/Paris']]))).toThrow('kraj');
		expect(getRegion()).toEqual(DEFAULT_REGION);
	});
});

describe('panel: reguły pojemników', () => {
	const rulesForm = (rows: [string, string, string, string][]) =>
		form(rows.flatMap(([match, label, bin, color]) => [['match', match], ['label', label], ['bin', bin], ['color', color]] as [string, string][]));

	it('zapis tabeli: pusty wiersz pomijany, identyfikator z nazwy', () => {
		const db = fresh();
		saveWasteRules(
			db,
			rulesForm([
				['zmieszane', 'Zmieszane', '', '#52525b'],
				['/gabaryt|wielkogabaryt/', 'Duże śmieci', '', '#a8a29e'],
				['', '', '', '#7c7c7c']
			])
		);
		expect(getSetting(db, 'wasteRules')).toEqual([
			{ match: 'zmieszane', bin: 'zmieszane', label: 'Zmieszane', color: '#52525b' },
			{ match: '/gabaryt|wielkogabaryt/', bin: 'duze-smieci', label: 'Duże śmieci', color: '#a8a29e' }
		]);
	});

	it('odrzuca błędny regex, brak nazwy i kolor jak u domownika', () => {
		const db = fresh();
		expect(() => saveWasteRules(db, rulesForm([['/(/', 'X', '', '#123456']]))).toThrow('wyrażenie');
		expect(() => saveWasteRules(db, rulesForm([['abc', '', '', '#123456']]))).toThrow('nazwę');
		expect(() => saveWasteRules(db, rulesForm([['abc', 'Abc', '', '#0ea5e8']]))).toThrow('Tata');
		expect(() => saveWasteRules(db, rulesForm([['', '', '', '#123456']]))).toThrow('co najmniej jedną');
	});

	it('kolory domowników sprawdzane wobec aktualnych reguł', () => {
		const db = fresh();
		const member = (color: string) => form([['name', 'Gość'], ['color', color]]);
		expect(() => saveMember(db, member('#f5c400'))).toThrow('pojemnika');
		saveWasteRules(db, form([['match', 'rest'], ['label', 'Rest'], ['bin', 'rest'], ['color', '#000000']]));
		expect(() => saveMember(db, member('#f5c400'))).not.toThrow();
		expect(() => saveMember(db, member('#050505'))).toThrow('pojemnika');
		loadWastePreset(db, form([['preset', 'PL']]));
		expect(binClashes(db)).toEqual([{ member: 'Gość', bin: 'Metale i tworzywa' }]);
	});
});

describe('panel: ręczne terminy wywozu', () => {
	it('zastępują przykładowe terminy i trafiają do zadań „wystaw”', () => {
		const db = fresh();
		addManualPickup(db, form([['date', '2026-11-13'], ['bin', 'papier']]));
		addManualPickup(db, form([['date', '2026-11-13'], ['bin', 'papier']])); // bez duplikatu
		expect(getSetting(db, 'wasteManual')).toEqual([{ date: '2026-11-13', bin: 'papier' }]);
		expect(() => addManualPickup(db, form([['date', '2026-11-13'], ['bin', 'nie-ma']]))).toThrow('pojemnik');

		const d = buildDashboard(db, new Date('2026-11-12T15:00:00Z'));
		const waste = d.events.filter((e) => e.kind === 'waste' && e.id.startsWith('waste-'));
		expect(waste.map((e) => [e.start, e.title, e.binColor])).toEqual([['2026-11-13', 'Papier', '#1d4ed8']]);
		expect(d.tasks.find((t) => t.kind === 'waste')).toMatchObject({ title: 'Wystawić: Papier', bin: 'papier', binColor: '#1d4ed8' });

		deleteManualPickup(db, form([['date', '2026-11-13'], ['bin', 'papier']]));
		expect(getSetting(db, 'wasteManual')).toEqual([]);
	});
});
