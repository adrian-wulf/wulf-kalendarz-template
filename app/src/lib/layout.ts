/**
 * Układy ekranu kiosku: gotowe ustawienia siatki, rozdzielczość, obrót i gęstość.
 * Moduł wspólny dla serwera (ustawienia), kiosku (Stage) i panelu (podgląd).
 */
import { t } from './i18n/index.js';

export type Size = { w: number; h: number };

export const LAYOUT_PRESETS = [
	{ id: 'today-week', base: { w: 1920, h: 1080 } },
	{ id: 'week', base: { w: 1920, h: 1080 } },
	{ id: 'month', base: { w: 1920, h: 1080 } },
	{ id: 'portrait', base: { w: 1080, h: 1920 } },
	{ id: 'small', base: { w: 1280, h: 800 } }
] as const satisfies readonly { id: string; base: Size }[];

/** Nazwa i opis układu w bieżącym języku. */
export const presetName = (id: LayoutPresetId) => t(`layout.${id}.name`);
export const presetDesc = (id: LayoutPresetId) => t(`layout.${id}.desc`);

export type LayoutPresetId = (typeof LAYOUT_PRESETS)[number]['id'];
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

/** Rozdzielczości do wyboru w panelu (dowolna inna w granicach też przejdzie walidację). */
export const RESOLUTIONS: (Size & { label: () => string })[] = [
	{ w: 1920, h: 1080, label: () => 'Full HD 1920×1080' },
	{ w: 2560, h: 1440, label: () => 'QHD 2560×1440' },
	{ w: 1366, h: 768, label: () => 'Laptop / AIO 1366×768' },
	{ w: 1280, h: 800, label: () => 'Tablet 1280×800' },
	{ w: 1080, h: 1920, label: () => t('layout.res.portrait') }
];

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];
export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export type LayoutSettings = {
	preset: LayoutPresetId;
	/** 'auto' – wymiary okna przeglądarki; inaczej ekran, pod który liczymy siatkę. */
	resolution: Size | 'auto';
	/** Tylko informacja dla instalacji: obraca kompozytor (wlr-randr), nie przeglądarka. */
	rotation: Rotation;
	density: Density;
};

export const DEFAULT_LAYOUT: LayoutSettings = { preset: 'today-week', resolution: 'auto', rotation: 0, density: 'comfortable' };

/** Granice dla rozdzielczości podanej ręcznie (np. przez API albo zapis w bazie). */
export const RES_MIN = 640;
export const RES_MAX = 7680;

export const presetOf = (id: string): LayoutPreset | undefined => LAYOUT_PRESETS.find((p) => p.id === id);

export class LayoutError extends Error {}

/** „1920x1080” albo „1920×1080” → { w, h }; null, gdy to nie wymiary. */
export function parseSize(v: string): Size | null {
	const m = /^\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\s*$/i.exec(v);
	return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

export const sizeKey = (s: Size | 'auto') => (s === 'auto' ? 'auto' : `${s.w}x${s.h}`);

const sizeOk = (s: Size) => [s.w, s.h].every((n) => Number.isInteger(n) && n >= RES_MIN && n <= RES_MAX);

/**
 * Ścisła walidacja (formularz panelu, API): każdy błąd to wyjątek z komunikatem w języku interfejsu.
 * Pola nie podane biorą wartość domyślną.
 */
export function validateLayout(v: unknown): LayoutSettings {
	if (!v || typeof v !== 'object') throw new LayoutError(t('layout.err.missing'));
	const o = v as Record<string, unknown>;
	const preset = o.preset ?? DEFAULT_LAYOUT.preset;
	if (typeof preset !== 'string' || !presetOf(preset)) throw new LayoutError(t('layout.err.preset'));

	let resolution: LayoutSettings['resolution'] = 'auto';
	const r = o.resolution ?? 'auto';
	if (r !== 'auto') {
		const s = typeof r === 'string' ? parseSize(r) : r && typeof r === 'object' ? { w: Number((r as Size).w), h: Number((r as Size).h) } : null;
		if (!s || !sizeOk(s)) throw new LayoutError(t('layout.err.resolution', { min: RES_MIN, max: RES_MAX }));
		resolution = s;
	}

	const rotation = Number(o.rotation ?? 0);
	if (!(ROTATIONS as readonly number[]).includes(rotation)) throw new LayoutError(t('layout.err.rotation'));

	const density = o.density ?? DEFAULT_LAYOUT.density;
	if (!(DENSITIES as readonly unknown[]).includes(density)) throw new LayoutError(t('layout.err.density'));

	return { preset: preset as LayoutPresetId, resolution, rotation: rotation as Rotation, density: density as Density };
}

/** Łagodne odczytanie (baza): złe pole → wartość domyślna tego pola, nigdy wyjątek. */
export function normalizeLayout(v: unknown): LayoutSettings {
	if (!v || typeof v !== 'object') return DEFAULT_LAYOUT;
	const o = v as Record<string, unknown>;
	const out = { ...DEFAULT_LAYOUT };
	for (const k of Object.keys(DEFAULT_LAYOUT) as (keyof LayoutSettings)[]) {
		try {
			(out as Record<string, unknown>)[k] = validateLayout({ [k]: o[k] })[k];
		} catch {
			/* zostaje domyślne */
		}
	}
	return out;
}

/**
 * Ustawienia z bazy z nadpisaniem z adresu (podgląd w panelu): `?layout=month&res=1080x1920&density=compact`.
 * Złe wartości z adresu są pomijane.
 */
export function layoutFromQuery(saved: LayoutSettings, q: { get(k: string): string | null }): LayoutSettings {
	const out = { ...saved };
	const preset = q.get('layout');
	if (preset && presetOf(preset)) out.preset = preset as LayoutPresetId;
	const res = q.get('res');
	if (res === 'auto') out.resolution = 'auto';
	else if (res) {
		const s = parseSize(res);
		if (s && sizeOk(s)) out.resolution = s;
	}
	const density = q.get('density');
	if (density && (DENSITIES as readonly string[]).includes(density)) out.density = density as Density;
	return out;
}

/**
 * Płótno, na którym rysujemy układ: krótszy bok jak w projekcie układu, dłuższy dociągnięty
 * do proporcji ekranu (16:10 i 16:9 bez czarnych pasów). Gdy orientacja ekranu nie pasuje
 * do układu albo proporcje są skrajne – płótno projektu, wpasowane z pasami.
 */
export function canvasSize(base: Size, screen: Size): Size {
	const baseLandscape = base.w >= base.h;
	if (baseLandscape !== screen.w >= screen.h) return base;
	const short = Math.min(base.w, base.h);
	const ratio = Math.max(screen.w, screen.h) / Math.min(screen.w, screen.h);
	if (ratio < 1.5 || ratio > 2.4) return base;
	const long = Math.round(short * ratio);
	return baseLandscape ? { w: long, h: short } : { w: short, h: long };
}

/**
 * Warstwa okien (dodawanie, lista, dzień) jest projektowana na co najmniej 1440×1000:
 * na wąskim lub niskim płótnie rysujemy ją większą i pomniejszamy o `k`.
 */
export function overlayBox(canvas: Size): Size & { k: number } {
	const k = Math.max(1, 1440 / canvas.w, 1000 / canvas.h);
	return { w: Math.round(canvas.w * k), h: Math.round(canvas.h * k), k };
}

/**
 * Polecenie obrotu dla instrukcji instalacji: Cage sam nie obraca obrazu, robi to `wlr-randr`
 * w sesji Wayland (dotyk obraca się razem z wyjściem). Nazwę wyjścia pokazuje `wlr-randr` bez argumentów.
 */
export function rotationCommand(rotation: Rotation, output = 'HDMI-A-1') {
	return `wlr-randr --output ${output} --transform ${rotation === 0 ? 'normal' : rotation}`;
}
