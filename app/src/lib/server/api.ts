import { error, json } from '@sveltejs/kit';
import { InputError } from './store.js';
import { GoogleError } from './google.js';
import { BringError } from './bring.js';
import { t } from '#lib/i18n/index.js';

/** Wspólna obsługa tras API kiosku: JSON na wejściu, 400 przy złych danych. */
export async function handle<T>(request: Request | null, fn: (body: Record<string, unknown>) => T | Promise<T>) {
	let body: Record<string, unknown> = {};
	if (request) {
		try {
			body = (await request.json()) as Record<string, unknown>;
		} catch {
			error(400, t('err.json'));
		}
	}
	try {
		return json((await fn(body)) ?? { ok: true });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		if (e instanceof GoogleError || e instanceof BringError) error(502, e.message);
		throw e;
	}
}
