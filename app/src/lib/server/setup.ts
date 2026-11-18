import { appFetch } from './net.js';
import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { members, settings } from './db/schema.js';
import { listMembers, newMemberId } from './admin.js';
import { getSetting, refreshNow, setSetting, wasteRules } from './sync.js';
import { getTheme, setTheme } from './theme.js';
import { isConnected } from './google.js';
import { isBringReady } from './bring.js';
import type { Fetcher } from './sources/index.js';
import { isValidTimeZone } from '#lib/logic/dates.js';
import { binColors } from '#lib/logic/waste.js';
import { COUNTRIES, SUBDIVISIONS } from '#lib/region.js';
import { presetById } from '#lib/theme.js';
import { MODULES, getModule, setEnabled } from '#lib/modules/index.js';
import { getLang, isLang, setLang, t } from '#lib/i18n/index.js';
import { getLayout, setLayout } from './layout.js';
import { localizeDefaultPlaces } from './pantry.js';
import { LayoutError, validateLayout } from '#lib/layout.js';
import { activeServers, modulesSetting, moduleStates, saveModules, SEEDED } from '#lib/modules/registry.server.js';
import {
	FRESH_STATE,
	STEPS,
	SetupError,
	checkDemo,
	checkMembers,
	checkPlace,
	checkRegion,
	isStepId,
	nextStep,
	normalizeState,
	stepIndex,
	stepLabel,
	toggleModule,
	usablePalette,
	type Place,
	type SetupState,
	type StepId
} from '#lib/setup.js';

/**
 * Kreator pierwszego uruchomienia – strona serwera. Każdy krok zapisuje się od razu do zwykłych
 * ustawień (region, lokalizacja, domownicy, moduły, motyw), więc restart w trakcie wraca do tego
 * samego kroku, a ponowne uruchomienie z panelu pokazuje obecne wartości.
 */

const hasRow = (db: DB, key: string) => !!db.select().from(settings).where(eq(settings.key, key)).get();

/** Kreator do zrobienia: kiosk `/` przekierowuje na `/setup`, a `/setup` jest otwarte. */
export const setupPending = (db: DB) => getSetting(db, 'setupDone') === false;

/**
 * Przy starcie. Świeża instalacja (brak domowników i śladu po seedzie) → kreator.
 * Istniejąca instalacja → od razu „zrobione”, żeby działający kiosk nigdy nie zobaczył kreatora.
 * `SKIP_SETUP=1` (testy, praca nad aplikacją): świeża baza z danymi przykładowymi, bez kreatora.
 */
export function initSetup(db: DB, env: Record<string, string | undefined> = process.env) {
	if (getSetting(db, 'setupDone') !== null) return;
	const existing = hasRow(db, SEEDED) || db.select().from(members).all().length > 0;
	if (existing || env.SKIP_SETUP === '1') setSetting(db, 'setupDone', true);
	else {
		setSetting(db, 'setupDone', false);
		setSetting(db, 'setup', FRESH_STATE);
	}
}

/** Z panelu: kreator jeszcze raz, z obecnymi wartościami (wszystkie kroki dostępne). */
export function restartSetup(db: DB) {
	setSetting(db, 'setup', { step: 'lang', saved: STEPS.filter((s) => s.id !== 'summary').map((s) => s.id) });
	setSetting(db, 'setupDone', false);
}

export const setupState = (db: DB): SetupState => normalizeState(getSetting(db, 'setup'));

/** Krok jest dostępny, gdy wszystkie wcześniejsze są zapisane. */
export const reachable = (state: SetupState, step: StepId) => STEPS.slice(0, stepIndex(step)).every((s) => state.saved.includes(s.id));

export function goToStep(db: DB, step: unknown) {
	const state = setupState(db);
	if (!isStepId(step) || !reachable(state, step)) throw new SetupError(t('setup.err.previous'));
	setSetting(db, 'setup', { ...state, step });
}

/** Język interfejsu (krok „Język” i panel): zapis i przełączenie bieżącego żądania. */
export function setLanguage(db: DB, lang: unknown) {
	if (!isLang(lang)) throw new SetupError(t('setup.err.language'));
	setSetting(db, 'language', lang);
	setLang(lang);
	localizeDefaultPlaces(db, lang);
}

/** Kolory pojemników z reguł dla kraju z regionu (zarezerwowane – domownicy ich nie dostaną). */
const reservedColors = (db: DB) => binColors(wasteRules(db));

/** Wszystko, czego potrzebuje strona `/setup`. */
export function setupData(db: DB, env: Record<string, string | undefined> = process.env) {
	const state = setupState(db);
	const states = moduleStates(db);
	const bins = reservedColors(db);
	const location = getSetting(db, 'location');
	return {
		state,
		reachable: STEPS.filter((s) => reachable(state, s.id)).map((s) => s.id),
		language: getSetting(db, 'language'),
		region: hasRow(db, 'region') ? getSetting(db, 'region') : null,
		countries: COUNTRIES,
		subdivisions: SUBDIVISIONS,
		timezones: Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('Europe/')),
		place: hasRow(db, 'location') ? location : null,
		members: listMembers(db).map(({ id, name, color }) => ({ id, name, color })),
		palette: usablePalette(bins),
		bins,
		modules: states
			.filter((s) => !getModule(s.id)?.core)
			.map((s) => {
				const m = getModule(s.id)!;
				return { id: s.id, name: m.name, description: m.description, enabled: s.enabled, requires: [...(m.requires ?? [])] };
			}),
		theme: getTheme(db).preset,
		layout: getLayout(db).preset,
		demo: state.saved.includes('data') ? (getSetting(db, 'demoData') ? ('example' as const) : ('empty' as const)) : null,
		adminUrl: env.PUBLIC_ORIGIN ? `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/admin` : null,
		google: isConnected(db),
		bring: isBringReady(db)
	};
}

export type SetupData = ReturnType<typeof setupData>;

function saveMembers(db: DB, input: unknown) {
	const list = checkMembers(input, reservedColors(db));
	const existing = listMembers(db);
	const keep = new Set(list.flatMap((m) => (m.id ? [m.id] : [])));
	db.transaction((tx) => {
		for (const m of existing) if (!keep.has(m.id)) tx.delete(members).where(eq(members.id, m.id)).run();
	});
	list.forEach((m, i) => {
		if (m.id && existing.some((e) => e.id === m.id)) db.update(members).set({ name: m.name, color: m.color, sortOrder: i }).where(eq(members.id, m.id)).run();
		else db.insert(members).values({ id: newMemberId(db, m.name), name: m.name, color: m.color, sortOrder: i }).run();
	});
}

function saveModuleToggles(db: DB, input: unknown) {
	if (!input || typeof input !== 'object') throw new SetupError(t('setup.err.modules'));
	// Zależności jeszcze raz po stronie serwera: zapasy bez zakupów nie mają sensu.
	let enabled: Record<string, boolean> = {};
	for (const m of MODULES) if (!('core' in m && m.core)) enabled[m.id] = !!(input as Record<string, unknown>)[m.id];
	for (const [id, on] of Object.entries(enabled)) if (on) enabled = toggleModule(enabled, id, true);
	let next = modulesSetting(db);
	for (const [id, on] of Object.entries(enabled)) next = setEnabled(next, id, on);
	saveModules(db, next);
}

/** Zapis kroku z danych z formularza (JSON). Zwraca następny krok. */
export function saveStep(db: DB, step: unknown, payload: Record<string, unknown>): StepId {
	if (!isStepId(step)) throw new SetupError(t('setup.err.step'));
	const state = setupState(db);
	if (!reachable(state, step)) throw new SetupError(t('setup.err.previous'));
	switch (step) {
		case 'lang':
			// Dalsze komunikaty tego żądania już w nowym języku.
			setLanguage(db, payload.language);
			break;
		case 'region': {
			setSetting(db, 'region', checkRegion(payload, isValidTimeZone));
			// Ferie, pogoda i śmieci z sieci odświeżają się w tle.
			void Promise.all(['ferien', 'waste'].map((n) => refreshNow(db, n)));
			break;
		}
		case 'place': {
			const p = checkPlace(payload);
			setSetting(db, 'location', p.name ? { lat: p.lat, lon: p.lon, name: p.name } : { lat: p.lat, lon: p.lon });
			void refreshNow(db, 'weather');
			break;
		}
		case 'members':
			saveMembers(db, payload.members);
			break;
		case 'modules':
			saveModuleToggles(db, payload.enabled);
			break;
		case 'theme': {
			const p = presetById(String(payload.preset ?? ''));
			if (!p) throw new SetupError(t('setup.err.theme'));
			const current = getTheme(db);
			// Ten sam motyw – własne kolory z panelu zostają; inny – czysty motyw z jego krojem pisma.
			if (current.preset !== p.id) setTheme(db, { preset: p.id, font: p.font, overrides: {}, evening: 'auto' });
			break;
		}
		case 'layout':
			try {
				// Tylko gotowy układ; rozdzielczość, obrót i gęstość zostają (panel → Układ ekranu).
				setLayout(db, validateLayout({ ...getLayout(db), preset: payload.preset }));
			} catch (e) {
				if (e instanceof LayoutError) throw new SetupError(e.message);
				throw e;
			}
			break;
		case 'data':
			setSetting(db, 'demoData', checkDemo(payload.demo) === 'example');
			break;
		case 'summary':
			throw new SetupError(t('setup.err.summary'));
	}
	const next = nextStep(step);
	setSetting(db, 'setup', { step: next, saved: [...new Set([...state.saved, step])] });
	return next;
}

/**
 * „Gotowe”: dane przykładowe według wyboru i koniec kreatora.
 * Przykład – seed każdego aktywnego modułu (funkcje seed nie dublują danych).
 * Pusty – żadnych przykładów; moduły liczą się jako zasiane, więc włączenie później też nic nie doda.
 */
export function finishSetup(db: DB) {
	const state = setupState(db);
	const missing = STEPS.filter((s) => s.id !== 'summary' && !state.saved.includes(s.id));
	if (missing.length) throw new SetupError(t('setup.err.missingStep', { step: stepLabel(missing[0].id) }));
	if (!listMembers(db).length) throw new SetupError(t('setup.err.noMembers'));
	const seeded = db.select().from(settings).where(eq(settings.key, SEEDED)).get()?.value as string[] | undefined;
	const done = new Set<string>(seeded ?? []);
	if (getSetting(db, 'demoData')) {
		for (const { manifest, server } of activeServers(db)) {
			server.seed?.(db);
			done.add(manifest.id);
		}
	} else for (const m of MODULES) done.add(m.id);
	db.insert(settings)
		.values({ key: SEEDED, value: [...done] })
		.onConflictDoUpdate({ target: settings.key, set: { value: [...done] } })
		.run();
	setSetting(db, 'setup', { step: 'summary', saved: state.saved });
	setSetting(db, 'setupDone', true);
}

// --- Geokodowanie (Open-Meteo) ---

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeoResult {
	name: string;
	latitude: number;
	longitude: number;
	country?: string;
	admin1?: string;
	admin2?: string;
}

/** Język nazw miejscowości w danym kraju – na wypadek, gdy wpisano nazwę lokalną w innym języku UI. */
const COUNTRY_LANG: Record<string, string> = { PL: 'pl', DE: 'de' };

/**
 * Miejscowości pasujące do nazwy (serwer pyta Open-Meteo – przeglądarka kiosku nie musi mieć dostępu).
 * Open-Meteo szuka tylko w nazwach w podanym języku (sprawdzone 11.2026: „Warszawa” z `language=en`
 * nie daje nic, „Warsaw” z `language=pl` – tak). Gdy w języku interfejsu nie ma wyników, pytamy
 * jeszcze raz w języku kraju (PL → pl, DE → de). Adres można podmienić zmienną `GEOCODING_URL` (testy).
 */
export async function searchPlaces(
	name: string,
	country: string | null,
	f: Fetcher = appFetch,
	base = process.env.GEOCODING_URL || GEOCODING_URL
): Promise<Place[]> {
	const q = name.trim();
	if (q.length < 2) return [];
	const langs = [...new Set([getLang(), ...(country && COUNTRY_LANG[country] ? [COUNTRY_LANG[country]] : [])])];
	for (const lang of langs) {
		const url = new URL(base);
		url.searchParams.set('name', q.slice(0, 80));
		url.searchParams.set('count', '8');
		url.searchParams.set('language', lang);
		url.searchParams.set('format', 'json');
		if (country) url.searchParams.set('countryCode', country);
		const res = await f(url.toString(), { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
		const body = (await res.json()) as { results?: GeoResult[] };
		const places = (body.results ?? [])
			.filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number' && r.name)
			.map((r) => ({
				name: r.name,
				lat: Math.round(r.latitude * 1e4) / 1e4,
				lon: Math.round(r.longitude * 1e4) / 1e4,
				detail: [r.admin2 && r.admin2 !== r.name ? r.admin2 : null, r.admin1, r.country].filter(Boolean).join(', ')
			}));
		if (places.length) return places;
	}
	return [];
}

export { SetupError };
