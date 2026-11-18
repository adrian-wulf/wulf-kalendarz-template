import { fail } from '@sveltejs/kit';
import { InputError } from './store.js';
import { getDb, type DB } from './db/index.js';
import { ConfigError } from '#lib/modules/settings.js';

/**
 * Każda akcja panelu: wykonaj operację, a błąd walidacji pokaż w formularzu.
 * `section` to klucz komunikatu (✓ / błąd) w sekcji, która wysłała formularz.
 */
export const act =
	(fn: (f: FormData, db: DB) => unknown | Promise<unknown>, section: string) =>
	async ({ request }: { request: Request }) => {
		const f = await request.formData();
		try {
			await fn(f, getDb());
			return { section, ok: true };
		} catch (e) {
			if (e instanceof InputError || e instanceof ConfigError) return fail(400, { section, error: e.message });
			throw e;
		}
	};
