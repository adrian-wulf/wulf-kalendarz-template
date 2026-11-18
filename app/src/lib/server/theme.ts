import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { settings } from './db/schema.js';
import { InputError } from './store.js';
import {
	CONTRAST_PAIRS,
	EDITABLE,
	FONTS,
	contrastProblems,
	isHex,
	normalizeTheme,
	presetById,
	resolveTheme,
	type FontId,
	type ThemeSettings,
	type TokenKey,
	type Tokens
} from '#lib/theme.js';
import { locale, t } from '#lib/i18n/index.js';

const KEY = 'theme';

export function getTheme(db: DB): ThemeSettings {
	return normalizeTheme(db.select().from(settings).where(eq(settings.key, KEY)).get()?.value);
}

export function setTheme(db: DB, value: ThemeSettings) {
	db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

const what = (k: TokenKey) => (k === 'fg' || k === 'muted' || k === 'alert' || k === 'accent' ? t(`theme.what.${k}`) : k);
const on = (k: TokenKey) => (k === 'bg' || k === 'card' || k === 'event-bg' || k === 'note' ? t(`theme.on.${k}`) : k);

/** Kolory z formularza (pola `${prefix}${token}`); zapamiętujemy tylko te inne niż w motywie. */
function readColors(f: FormData, prefix: string, base: Tokens) {
	const out: Partial<Record<TokenKey, string>> = {};
	for (const [k, label] of EDITABLE) {
		const v = String(f.get(prefix + k) ?? '').trim();
		if (!v) continue;
		if (!isHex(v)) throw new InputError(t('err.colorOf', { label: t(label).toLowerCase() }));
		if (v.toLowerCase() !== base[k]) out[k] = v.toLowerCase();
	}
	return out;
}

/** Odrzuca zmiany, przez które tekst przestałby być czytelny z korytarza. */
function checkContrast(tokens: Tokens, changed: Set<TokenKey>, when: string) {
	const pairs = CONTRAST_PAIRS.filter(([a, b]) => changed.has(a) || changed.has(b));
	const bad = contrastProblems(tokens, pairs)[0];
	if (bad) {
		const num = (n: number, d: number) => n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
		throw new InputError(t('err.contrast', { when, what: what(bad.fg), on: on(bad.bg), ratio: num(bad.ratio, 1), min: num(bad.min, Number.isInteger(bad.min) ? 0 : 1) }));
	}
}

export function parseThemeForm(f: FormData): ThemeSettings {
	const preset = presetById(String(f.get('preset') ?? ''));
	if (!preset) throw new InputError(t('err.theme'));
	const font = String(f.get('font') ?? '');
	if (!(font in FONTS)) throw new InputError(t('err.font'));
	const overrides = readColors(f, 'day-', preset.day);
	const evening = f.get('eveningAuto') ? ('auto' as const) : readColors(f, 'evening-', preset.evening);
	const theme: ThemeSettings = { preset: preset.id, font: font as FontId, overrides, evening };
	const r = resolveTheme(theme);
	checkContrast(r.day, new Set(Object.keys(overrides) as TokenKey[]), t('theme.when.day'));
	if (evening !== 'auto') checkContrast(r.evening, new Set(Object.keys(evening) as TokenKey[]), t('theme.when.evening'));
	return theme;
}

export function saveTheme(db: DB, f: FormData) {
	setTheme(db, parseThemeForm(f));
}

/** Powrót do kolorów motywu – motyw i krój pisma zostają. */
export function resetTheme(db: DB) {
	const t = getTheme(db);
	setTheme(db, { ...t, overrides: {}, evening: 'auto' });
}
