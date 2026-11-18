/**
 * Kreator pierwszego uruchomienia – część wspólna dla serwera i przeglądarki:
 * lista kroków, walidacja i drobne reguły (kolory domowników, zależności modułów).
 *
 * First-run setup wizard: shared step list, validation and pure helpers.
 */
import { MEMBER_PALETTE, clashesWithBins } from './colors.js';
import { COUNTRIES, SUBDIVISIONS, isCountry, type Country, type Region } from './region.js';
import { dependents, getModule } from './modules/index.js';
import { LANG_NAMES, LANGS, locale, t, type Lang } from './i18n/index.js';

export const STEPS = [
	{ id: 'lang' },
	{ id: 'region' },
	{ id: 'place' },
	{ id: 'members' },
	{ id: 'modules' },
	{ id: 'theme' },
	{ id: 'layout' },
	{ id: 'data' },
	{ id: 'summary' }
] as const;

/** Nazwa kroku w bieżącym języku. */
export const stepLabel = (id: StepId) => t(`setup.step.${id}`);

export type StepId = (typeof STEPS)[number]['id'];

export const isStepId = (s: unknown): s is StepId => STEPS.some((x) => x.id === s);
export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);
export const nextStep = (id: StepId): StepId => STEPS[Math.min(stepIndex(id) + 1, STEPS.length - 1)].id;
export const prevStep = (id: StepId): StepId => STEPS[Math.max(stepIndex(id) - 1, 0)].id;

/** Stan kreatora w `settings.setup`: bieżący krok i kroki już zapisane. */
export interface SetupState {
	step: StepId;
	saved: StepId[];
}

export const FRESH_STATE: SetupState = { step: 'lang', saved: [] };

export function normalizeState(v: unknown): SetupState {
	if (!v || typeof v !== 'object') return FRESH_STATE;
	const o = v as Record<string, unknown>;
	return {
		step: isStepId(o.step) ? o.step : 'lang',
		saved: Array.isArray(o.saved) ? o.saved.filter(isStepId) : []
	};
}

/** Języki interfejsu (nazwa zawsze we własnym języku). */
export const LANGUAGES = LANGS.map((code) => ({ code, name: LANG_NAMES[code] }));

export type Language = Lang;

/** Błąd danych kroku – komunikat do pokazania w kreatorze. */
export class SetupError extends Error {}

// --- Region ---

/** Kraj i strefa zgadnięte ze strefy czasowej przeglądarki (np. Europe/Warsaw → PL). */
export function guessRegion(tz: string | undefined): Region {
	const country: Country = tz === 'Europe/Warsaw' ? 'PL' : tz === 'Europe/Berlin' ? 'DE' : 'PL';
	const timezone = tz && tz.startsWith('Europe/') ? tz : COUNTRIES.find((c) => c.code === country)!.timezone;
	return { country, subdivision: SUBDIVISIONS[country][0].code, timezone };
}

export function checkRegion(r: { country?: unknown; subdivision?: unknown; timezone?: unknown }, validZone: (tz: string) => boolean): Region {
	const country = String(r.country ?? '');
	if (!isCountry(country)) throw new SetupError(t('setup.err.country'));
	const subdivision = String(r.subdivision ?? '');
	if (!SUBDIVISIONS[country].some((s) => s.code === subdivision)) throw new SetupError(country === 'PL' ? t('setup.err.voivodeship') : t('setup.err.land'));
	const timezone = String(r.timezone ?? '');
	if (!validZone(timezone)) throw new SetupError(t('setup.err.timezone'));
	return { country, subdivision, timezone };
}

// --- Miejscowość ---

export interface Place {
	name: string;
	lat: number;
	lon: number;
	/** np. „mazowieckie, Polska” – tylko do wyświetlenia */
	detail?: string;
}

export function checkPlace(p: { name?: unknown; lat?: unknown; lon?: unknown }): Place {
	const lat = typeof p.lat === 'number' ? p.lat : Number(String(p.lat ?? '').replace(',', '.'));
	const lon = typeof p.lon === 'number' ? p.lon : Number(String(p.lon ?? '').replace(',', '.'));
	if (String(p.lat ?? '').trim() === '' || String(p.lon ?? '').trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon))
		throw new SetupError(t('setup.err.place'));
	if (Math.abs(lat) > 90) throw new SetupError(t('setup.err.lat'));
	if (Math.abs(lon) > 180) throw new SetupError(t('setup.err.lon'));
	const name = String(p.name ?? '').trim().slice(0, 80);
	return { name, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}

// --- Domownicy ---

export interface DraftMember {
	/** istniejący domownik (ponowne uruchomienie kreatora) */
	id?: string;
	name: string;
	color: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Kolory z palety, które nie zlewają się z pojemnikami na śmieci. */
export const usablePalette = (binColors: readonly string[]): string[] => MEMBER_PALETTE.filter((c) => !clashesWithBins(c, binColors));

/** Kolor dla nowej osoby: pierwszy wolny z palety (bez kolizji z pojemnikami), potem po kolei od początku. */
export function nextColor(used: readonly string[], binColors: readonly string[]): string {
	const palette = usablePalette(binColors);
	const taken = new Set(used.map((c) => c.toLowerCase()));
	return palette.find((c) => !taken.has(c)) ?? palette[used.length % palette.length] ?? MEMBER_PALETTE[0];
}

export function checkMembers(list: unknown, binColors: readonly string[]): DraftMember[] {
	if (!Array.isArray(list) || !list.length) throw new SetupError(t('setup.err.noMembers'));
	if (list.length > 12) throw new SetupError(t('setup.err.tooMany'));
	const seen = new Set<string>();
	return list.map((raw: Record<string, unknown>) => {
		const name = String(raw?.name ?? '').trim();
		if (!name) throw new SetupError(t('setup.err.noName'));
		if (name.length > 30) throw new SetupError(t('setup.err.nameLong', { name: name.slice(0, 30) }));
		const key = name.toLocaleLowerCase(locale());
		if (seen.has(key)) throw new SetupError(t('setup.err.nameDup', { name }));
		seen.add(key);
		const color = String(raw?.color ?? '').toLowerCase();
		if (!HEX.test(color)) throw new SetupError(t('setup.err.color', { name }));
		if (clashesWithBins(color, binColors)) throw new SetupError(t('setup.err.colorBin', { name }));
		const id = typeof raw?.id === 'string' && raw.id ? raw.id : undefined;
		return { ...(id ? { id } : {}), name, color };
	});
}

// --- Moduły ---

/**
 * Przełączenie modułu z zależnościami: włączenie włącza też wymagane moduły,
 * wyłączenie wyłącza moduły, które bez niego nie działają.
 */
export function toggleModule(enabled: Record<string, boolean>, id: string, on: boolean): Record<string, boolean> {
	const m = getModule(id);
	if (!m || m.core) return enabled;
	const next = { ...enabled, [id]: on };
	if (on) for (const r of m.requires ?? []) if (!next[r]) Object.assign(next, toggleModule(next, r, true));
	if (!on) for (const d of dependents(id)) if (next[d]) Object.assign(next, toggleModule(next, d, false));
	return next;
}

// --- Dane przykładowe ---

export type DemoChoice = 'empty' | 'example';

export function checkDemo(v: unknown): DemoChoice {
	if (v === 'empty' || v === 'example') return v;
	throw new SetupError(t('setup.err.demo'));
}
