import { seedDemoNotes } from '#lib/server/db/seed.js';
import { getRoles, isConnected, type GoogleData } from '#lib/server/google.js';
import { activeNotes } from '#lib/server/store.js';
import { readCache } from '#lib/server/sync.js';
import { act } from '#lib/server/act.js';
import * as A from '#lib/server/admin.js';
import type { DB } from '#lib/server/db/index.js';
import type { Note } from '#lib/types.js';
import { defineServer } from '../server-types.js';

/** Kartki: z kalendarza Google „Kartki” (gdy przypisany), inaczej lokalne. */
export function currentNotes(db: DB, at: Date): Note[] {
	if (isConnected(db) && getRoles(db).notes) {
		const google = readCache<GoogleData>(db, 'google');
		return (google.data?.notes ?? []).filter((n) => n.expiresAt > at.toISOString());
	}
	return activeNotes(db, at).map(({ id, text, memberId, expiresAt }) => ({ id, text, memberId, expiresAt }));
}

export default defineServer('notes', {
	seed: seedDemoNotes,
	dashboard: ({ db, at }) => ({ data: currentNotes(db, at) }),
	admin: {
		load: (db) => ({ notes: currentNotes(db, new Date()), googleNotes: !!getRoles(db).notes }),
		actions: {
			saveNote: act((f, db) => A.saveNote(db, f), 'notes'),
			deleteNote: act((f, db) => A.deleteNote(db, f), 'notes')
		}
	}
});
