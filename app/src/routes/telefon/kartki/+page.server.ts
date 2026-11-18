import { getDb } from '#lib/server/db/index.js';
import { currentNotes } from '#lib/modules/notes/hooks.server.js';

export function load() {
	const now = new Date();
	return { notes: currentNotes(getDb(), now).toSorted((a, b) => a.expiresAt.localeCompare(b.expiresAt)), now: now.toISOString() };
}
