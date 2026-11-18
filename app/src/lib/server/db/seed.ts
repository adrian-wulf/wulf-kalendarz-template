import type { DB } from '.';
import { chores, localNotes, localShopping, members } from './schema';
import { demoShopping } from '../demo';
import { t } from '#lib/i18n/index.js';

/**
 * Dane startowe: zastępcze imiona i przykłady, do zmiany w panelu. Każda funkcja należy do
 * jednego modułu (patrz `seed` w `lib/modules/<id>/hooks.server.ts`); rejestr woła ją raz na
 * instalację. Same funkcje też nie dublują danych przy ponownym wywołaniu.
 */
export function seed(db: DB) {
	seedMembers(db);
	seedDemoChores(db);
	seedDemoShopping(db);
	seedDemoNotes(db);
}

export function seedMembers(db: DB) {
	if (db.select().from(members).all().length > 0) return;
	db.insert(members)
		.values([
			{ id: 'tata', name: t('demo.member.tata'), color: '#0ea5e9', sortOrder: 0 },
			{ id: 'mama', name: t('demo.member.mama'), color: '#e0457b', sortOrder: 1 },
			{ id: 'babcia', name: t('demo.member.babcia'), color: '#8b5cf6', sortOrder: 2 },
			{ id: 'wujek', name: t('demo.member.wujek'), color: '#f2994a', sortOrder: 3 },
			{ id: 'ola', name: 'Ola', color: '#c026d3', sortOrder: 4 },
			{ id: 'kuba', name: 'Kuba', color: '#dc2626', sortOrder: 5 }
		])
		.run();
}

const memberIf = (db: DB, id: string) => (db.select().from(members).all().some((m) => m.id === id) ? id : null);

export function seedDemoChores(db: DB) {
	if (db.select().from(chores).all().length > 0) return;
	db.insert(chores)
		.values([
			{ title: t('demo.chore1'), recurrence: { type: 'monthly', day: 1 }, startDate: '2026-01-01' },
			{ title: t('demo.chore2'), memberId: memberIf(db, 'babcia'), recurrence: { type: 'weekly', days: [7] }, startDate: '2026-01-01' }
		])
		.run();
}

/** Przykładowe zakupy, żeby ekran nie był pusty przed podłączeniem Bring!. */
export function seedDemoShopping(db: DB) {
	const now = new Date().toISOString();
	db.insert(localShopping)
		.values(demoShopping().map((i) => ({ ...i, spec: i.spec ?? null, icon: i.icon ?? null, addedAt: now })))
		.onConflictDoNothing()
		.run();
}

/** Przykładowe kartki na tydzień. */
export function seedDemoNotes(db: DB) {
	const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
	db.insert(localNotes)
		.values([
			{ id: 'demo-n1', text: `${t('demo.note1')} 🍲`, memberId: memberIf(db, 'mama'), expiresAt: week },
			{ id: 'demo-n2', text: t('demo.note2'), memberId: memberIf(db, 'tata'), expiresAt: week }
		])
		.onConflictDoNothing()
		.run();
}
