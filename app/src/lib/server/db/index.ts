import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type DB = ReturnType<typeof openDb>;

const MIGRATIONS = resolve(process.env.MIGRATIONS_PATH ?? 'drizzle');

/** Otwiera bazę (plik albo ':memory:') i stosuje migracje. */
export function openDb(path: string) {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS });
	return db;
}

let instance: DB | undefined;

export function getDb(): DB {
	instance ??= openDb(process.env.DATABASE_PATH ?? 'data/kalendarz.db');
	return instance;
}
