import type { ConfigOf, SettingsField, SettingsSchema } from './types.js';
import { t } from '#lib/i18n/index.js';

/** Błąd walidacji ustawień modułu (komunikat do pokazania w panelu). */
export class ConfigError extends Error {}

/** Typowany schemat ustawień – tylko pomaga TypeScriptowi (zwraca to samo). */
export const defineSettings = <S extends SettingsSchema>(s: S) => s;

export function defaultsOf<S extends SettingsSchema>(schema: S): ConfigOf<S> {
	return Object.fromEntries(Object.entries(schema).map(([k, f]) => [k, f.default])) as ConfigOf<S>;
}

/** Zapisane wartości na wierzchu domyślnych; nieznane klucze i złe typy odpadają. */
export function withDefaults<S extends SettingsSchema>(schema: S, stored: Record<string, unknown> | undefined): ConfigOf<S> {
	const out: Record<string, unknown> = defaultsOf(schema);
	for (const [k, f] of Object.entries(schema)) {
		const v = stored?.[k];
		if (v === undefined) continue;
		try {
			out[k] = check(f, v);
		} catch {
			// stara albo uszkodzona wartość – zostaje domyślna
		}
	}
	return out as ConfigOf<S>;
}

function check(f: SettingsField, v: unknown): unknown {
	switch (f.type) {
		case 'number': {
			const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
			if (!Number.isFinite(n)) throw new ConfigError(t('config.number', { label: f.label }));
			if (f.min !== undefined && n < f.min) throw new ConfigError(t('config.min', { label: f.label, min: f.min }));
			if (f.max !== undefined && n > f.max) throw new ConfigError(t('config.max', { label: f.label, max: f.max }));
			return n;
		}
		case 'boolean':
			if (typeof v === 'boolean') return v;
			return v === 'on' || v === 'true' || v === '1';
		case 'text': {
			const s = String(v).trim();
			if (f.maxLength !== undefined && s.length > f.maxLength) throw new ConfigError(t('config.tooLong', { label: f.label }));
			if (f.pattern && s && !new RegExp(`^(?:${f.pattern})$`).test(s)) throw new ConfigError(t('config.format', { label: f.label }));
			return s;
		}
		case 'select': {
			const s = String(v);
			if (!f.options.some(([o]) => o === s)) throw new ConfigError(t('config.unknown', { label: f.label }));
			return s;
		}
	}
}

/**
 * Wartości z formularza (FormData lub obiekt) → sprawdzone ustawienia. Brakujący checkbox = false,
 * brakujące inne pole = wartość domyślna. Zły wpis → `ConfigError`.
 */
export function parseConfig<S extends SettingsSchema>(schema: S, input: FormData | Record<string, unknown>): ConfigOf<S> {
	const get = (k: string) => (input instanceof FormData ? (input.get(k) ?? undefined) : input[k]);
	const out: Record<string, unknown> = {};
	for (const [k, f] of Object.entries(schema)) {
		const v = get(k);
		if (f.type === 'boolean') out[k] = v === undefined ? false : check(f, v);
		else out[k] = v === undefined || v === '' ? f.default : check(f, v);
	}
	return out as ConfigOf<S>;
}
