import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { settings } from './db/schema.js';

/**
 * Wpis w tabeli `settings` pod własnym kluczem modułu (np. wybrany przystanek) – poza
 * `DEFAULT_SETTINGS`, bo to dane modułu, nie ustawienia rdzenia. Null usuwa wpis.
 */
export function getKv<T>(db: DB, key: string, fallback: T): T {
	const row = db.select().from(settings).where(eq(settings.key, key)).get();
	return row ? (row.value as T) : fallback;
}

export function setKv(db: DB, key: string, value: unknown) {
	if (value === null || value === undefined) return void db.delete(settings).where(eq(settings.key, key)).run();
	db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
