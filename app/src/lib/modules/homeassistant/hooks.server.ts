import { act } from '#lib/server/act.js';
import { InputError } from '#lib/server/store.js';
import { refreshNow } from '#lib/server/sync.js';
import * as H from '#lib/server/homeassistant.js';
import { defineServer } from '../server-types.js';

export default defineServer('homeassistant', {
	sources: (db) => {
		const s = H.haSource(db);
		return s ? [s] : [];
	},
	dashboard: ({ db }) => H.haTile(db),
	admin: {
		load: async (db) => {
			const pub = H.haPublic(db);
			let entities: { entityId: string; name: string; state: string }[] = [];
			let error: string | null = null;
			if (pub.url)
				try {
					entities = await H.pickableEntities(db);
				} catch (e) {
					error = e instanceof Error ? e.message : String(e);
				}
			return { ha: { ...pub, entities, error, selected: H.selectedEntities(db) } };
		},
		actions: {
			saveHaAuth: act(async (f, db) => {
				H.saveHaAuth(db, f);
				// refreshNow wstawia źródło do pętli synchronizacji, gdy dopiero powstało.
				await refreshNow(db, 'homeassistant');
			}, 'haAuth'),
			disconnectHa: act((_, db) => H.haDisconnect(db), 'haAuth'),
			saveHaEntities: act(async (f, db) => {
				try {
					H.saveEntities(db, f);
				} catch (e) {
					if (e instanceof H.HaError) throw new InputError(e.message);
					throw e;
				}
				await refreshNow(db, 'homeassistant');
			}, 'haEntities')
		}
	}
});
