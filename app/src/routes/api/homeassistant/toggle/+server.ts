import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { refreshNow } from '#lib/server/sync.js';
import { HaError, toggleEntity } from '#lib/server/homeassistant.js';

/** Przełączenie światła/gniazdka z kiosku – serwer dokłada token, przeglądarka go nie zna. */
export const POST = ({ request }) =>
	handle(request, async (b) => {
		const db = getDb();
		try {
			await toggleEntity(db, b.entityId);
		} catch (e) {
			if (e instanceof HaError) error(502, e.message);
			throw e;
		}
		// Nowy stan od razu na ekranie (HA potrzebuje chwili – zwykle wystarczy).
		await refreshNow(db, 'homeassistant');
	});
