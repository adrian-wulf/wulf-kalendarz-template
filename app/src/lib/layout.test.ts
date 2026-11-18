import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LAYOUT,
	LAYOUT_PRESETS,
	LayoutError,
	canvasSize,
	layoutFromQuery,
	normalizeLayout,
	overlayBox,
	parseSize,
	rotationCommand,
	validateLayout
} from './layout';
import { openDb } from './server/db/index';
import { getLayout, parseLayoutForm, saveLayout, setLayout } from './server/layout';
import { InputError } from './server/store';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('ustawienia układu – walidacja', () => {
	it('przyjmuje każdy układ, rozdzielczość jako tekst albo obiekt, obrót i gęstość', () => {
		for (const p of LAYOUT_PRESETS) expect(validateLayout({ preset: p.id }).preset).toBe(p.id);
		expect(validateLayout({ preset: 'month', resolution: '1080x1920', rotation: '90', density: 'compact' })).toEqual({
			preset: 'month',
			resolution: { w: 1080, h: 1920 },
			rotation: 90,
			density: 'compact'
		});
		expect(validateLayout({ preset: 'week', resolution: { w: 2560, h: 1440 } }).resolution).toEqual({ w: 2560, h: 1440 });
		expect(validateLayout({ preset: 'week', resolution: '1366×768' }).resolution).toEqual({ w: 1366, h: 768 });
		expect(validateLayout({ preset: 'small' })).toEqual({ ...DEFAULT_LAYOUT, preset: 'small' });
	});

	it('odrzuca nieznany układ, złą rozdzielczość, obrót i gęstość', () => {
		expect(() => validateLayout(null)).toThrow(LayoutError);
		expect(() => validateLayout({ preset: 'kafelki' })).toThrow('Nieznany układ');
		expect(() => validateLayout({ preset: 'week', resolution: '100x100' })).toThrow('Zła rozdzielczość');
		expect(() => validateLayout({ preset: 'week', resolution: '1920x1080px' })).toThrow('Zła rozdzielczość');
		expect(() => validateLayout({ preset: 'week', resolution: { w: 1920.5, h: 1080 } })).toThrow('Zła rozdzielczość');
		expect(() => validateLayout({ preset: 'week', resolution: { w: 9000, h: 1080 } })).toThrow('Zła rozdzielczość');
		expect(() => validateLayout({ preset: 'week', rotation: 45 })).toThrow('Obrót');
		expect(() => validateLayout({ preset: 'week', density: 'ciasna' })).toThrow('gęstość');
	});

	it('odczyt z bazy jest łagodny: złe pole → wartość domyślna, reszta zostaje', () => {
		expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
		expect(normalizeLayout('month')).toEqual(DEFAULT_LAYOUT);
		expect(normalizeLayout({ preset: 'portrait', resolution: 'zly', rotation: 90, density: 'x' })).toEqual({
			preset: 'portrait',
			resolution: 'auto',
			rotation: 90,
			density: 'comfortable'
		});
	});

	it('podgląd: ?layout, ?res i ?density nadpisują zapis, złe wartości są pomijane', () => {
		const q = (s: string) => new URLSearchParams(s);
		expect(layoutFromQuery(DEFAULT_LAYOUT, q('layout=month&res=1080x1920&density=compact'))).toEqual({
			preset: 'month',
			resolution: { w: 1080, h: 1920 },
			rotation: 0,
			density: 'compact'
		});
		const saved = { ...DEFAULT_LAYOUT, preset: 'week' as const, resolution: { w: 1280, h: 800 } };
		expect(layoutFromQuery(saved, q('layout=nic&res=1x1&density=zla'))).toEqual(saved);
		expect(layoutFromQuery(saved, q('res=auto')).resolution).toBe('auto');
	});

	it('parseSize i polecenie obrotu', () => {
		expect(parseSize('1280x800')).toEqual({ w: 1280, h: 800 });
		expect(parseSize('auto')).toBeNull();
		expect(rotationCommand(0)).toBe('wlr-randr --output HDMI-A-1 --transform normal');
		expect(rotationCommand(90, 'eDP-1')).toBe('wlr-randr --output eDP-1 --transform 90');
	});
});

describe('płótno układu', () => {
	const fhd = { w: 1920, h: 1080 };
	it('16:9 bez zmian, 16:10 – szersze o proporcje, krótszy bok jak w projekcie', () => {
		expect(canvasSize(fhd, { w: 1920, h: 1080 })).toEqual(fhd);
		expect(canvasSize(fhd, { w: 2560, h: 1440 })).toEqual(fhd);
		expect(canvasSize(fhd, { w: 1280, h: 800 })).toEqual({ w: 1728, h: 1080 });
		expect(canvasSize({ w: 1280, h: 800 }, { w: 1366, h: 768 })).toEqual({ w: 1423, h: 800 });
		expect(canvasSize({ w: 1080, h: 1920 }, { w: 1200, h: 1920 })).toEqual({ w: 1080, h: 1728 });
	});
	it('inna orientacja albo skrajne proporcje – płótno projektu (z pasami)', () => {
		expect(canvasSize({ w: 1080, h: 1920 }, fhd)).toEqual({ w: 1080, h: 1920 });
		expect(canvasSize(fhd, { w: 1024, h: 1024 })).toEqual(fhd);
		expect(canvasSize(fhd, { w: 3840, h: 1080 })).toEqual(fhd);
	});
	it('warstwa okien ma co najmniej 1440×1000 (pionowy i mały ekran pomniejszają okna)', () => {
		expect(overlayBox(fhd)).toEqual({ w: 1920, h: 1080, k: 1 });
		const p = overlayBox({ w: 1080, h: 1920 });
		expect(p.w).toBe(1440);
		expect(p.k).toBeCloseTo(4 / 3);
		expect(overlayBox({ w: 1280, h: 800 })).toEqual({ w: 1600, h: 1000, k: 1.25 });
	});
});

describe('ustawienia układu w bazie', () => {
	it('domyślnie dziś + tydzień; zapis z formularza; złe dane jako błąd formularza', () => {
		const db = openDb(':memory:');
		expect(getLayout(db)).toEqual(DEFAULT_LAYOUT);
		saveLayout(db, form({ preset: 'portrait', resolution: '1080x1920', rotation: '270', density: 'compact' }));
		expect(getLayout(db)).toEqual({ preset: 'portrait', resolution: { w: 1080, h: 1920 }, rotation: 270, density: 'compact' });
		saveLayout(db, form({ preset: 'week', resolution: 'auto', rotation: '0', density: 'comfortable' }));
		expect(getLayout(db).resolution).toBe('auto');
		expect(() => parseLayoutForm(form({ preset: 'nic' }))).toThrow(InputError);
		expect(() => parseLayoutForm(form({ preset: 'week', resolution: '10x10' }))).toThrow(InputError);
		expect(() => parseLayoutForm(form({}))).toThrow('Nieznany układ');
	});

	it('uszkodzony zapis w bazie nie psuje kiosku', () => {
		const db = openDb(':memory:');
		setLayout(db, { preset: 'month', resolution: 'zle', rotation: 7, density: 'compact' } as never);
		expect(getLayout(db)).toEqual({ preset: 'month', resolution: 'auto', rotation: 0, density: 'compact' });
	});
});
