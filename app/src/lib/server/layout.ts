import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { settings } from './db/schema.js';
import { InputError } from './store.js';
import { LayoutError, normalizeLayout, validateLayout, type LayoutSettings } from '#lib/layout.js';

const KEY = 'layout';

export function getLayout(db: DB): LayoutSettings {
	return normalizeLayout(db.select().from(settings).where(eq(settings.key, KEY)).get()?.value);
}

export function setLayout(db: DB, value: LayoutSettings) {
	db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/** Formularz panelu: preset, resolution ('auto' albo 'WxH'), rotation, density. */
export function parseLayoutForm(f: FormData): LayoutSettings {
	const get = (k: string) => {
		const v = f.get(k);
		return v === null || v === '' ? undefined : String(v);
	};
	try {
		return validateLayout({ preset: get('preset') ?? '', resolution: get('resolution'), rotation: get('rotation'), density: get('density') });
	} catch (e) {
		if (e instanceof LayoutError) throw new InputError(e.message);
		throw e;
	}
}

export function saveLayout(db: DB, f: FormData) {
	setLayout(db, parseLayoutForm(f));
}
