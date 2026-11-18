import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { members } from './db/schema.js';
import { InputError } from './store.js';
import { t } from '#lib/i18n/index.js';

/**
 * Odczyt pól z formularza panelu (FormData) albo z JSON-a z kiosku/telefonu – jedna walidacja dla obu.
 * Używają go moduły posiłków, zadań dzieci i odliczania.
 */
export type Input = FormData | Record<string, unknown>;

export const raw = (f: Input, k: string): unknown => (f instanceof FormData ? (f.get(k) ?? undefined) : f[k]);
export const str = (f: Input, k: string) => {
	const v = raw(f, k);
	return v === undefined || v === null ? '' : String(v).trim();
};

export function need(f: Input, k: string, label: string, max = 80) {
	const v = str(f, k);
	if (!v) throw new InputError(t('err.required', { label }));
	if (v.length > max) throw new InputError(t('err.tooLong', { label }));
	return v;
}

export function int(f: Input, k: string, label: string, min: number, max: number) {
	const v = Number(str(f, k));
	if (!Number.isInteger(v) || v < min || v > max) throw new InputError(t('p3b.err.range', { label, min, max }));
	return v;
}

export function optId(f: Input, k: string): number | null {
	const v = str(f, k);
	if (!v) return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 1) throw new InputError(t('p3b.err.id'));
	return n;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function date(f: Input, k: string) {
	const v = str(f, k);
	if (!DATE.test(v) || Number.isNaN(Date.parse(v))) throw new InputError(t('err.date'));
	return v;
}

/** Emoji / ikona: krótki tekst (kilka znaków), pusty → domyślny. */
export function emoji(f: Input, k: string, fallback: string) {
	const v = str(f, k);
	if (!v) return fallback;
	if ([...v].length > 8) throw new InputError(t('p3b.err.emoji'));
	return v;
}

export function member(db: DB, f: Input, k: string, required: boolean): string | null {
	const v = str(f, k);
	if (!v) {
		if (required) throw new InputError(t('err.member'));
		return null;
	}
	if (!db.select().from(members).where(eq(members.id, v)).get()) throw new InputError(t('err.member'));
	return v;
}

export const bool = (f: Input, k: string) => {
	const v = raw(f, k);
	return v === true || v === 'on' || v === 'true' || v === '1';
};
