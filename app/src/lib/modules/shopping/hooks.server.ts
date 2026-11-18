import { asc } from 'drizzle-orm';
import { localShopping } from '#lib/server/db/schema.js';
import { seedDemoShopping } from '#lib/server/db/seed.js';
import { bringDisconnect, bringEmail, bringLists, fetchBring, getBringConfig, isBringReady } from '#lib/server/bring.js';
import { readCache, refreshNow } from '#lib/server/sync.js';
import { act } from '#lib/server/act.js';
import * as A from '#lib/server/admin.js';
import type { ShoppingItem } from '#lib/types.js';
import { defineServer } from '../server-types.js';

export default defineServer('shopping', {
	seed: seedDemoShopping,
	sources: (db) => (isBringReady(db) ? [{ name: 'bring', intervalMs: 30_000, fetch: (f) => fetchBring(db, f) }] : []),
	dashboard: ({ db }) => {
		const bring = isBringReady(db) ? readCache<ShoppingItem[]>(db, 'bring') : null;
		if (bring) return { data: bring.data, status: { bring: bring.status } };
		const local = db
			.select()
			.from(localShopping)
			.orderBy(asc(localShopping.addedAt))
			.all()
			.map(({ id, name, spec, icon }) => ({ id, name, spec: spec ?? undefined, icon: icon ?? undefined }));
		return { data: local };
	},
	admin: {
		load: async (db) => {
			const email = bringEmail(db);
			let lists: { listUuid: string; name: string }[] = [];
			let error: string | null = null;
			if (email) {
				try {
					lists = await bringLists(db);
				} catch (e) {
					error = e instanceof Error ? e.message : String(e);
				}
			}
			return { bring: { email, lists, error, config: getBringConfig(db) }, shopping: A.listShopping(db) };
		},
		actions: {
			connectBring: act((f, db) => A.connectBring(db, f), 'bring'),
			chooseBringList: act(async (f, db) => {
				await A.chooseBringList(db, f);
				await refreshNow(db, 'bring');
			}, 'bring'),
			disconnectBring: act((_, db) => bringDisconnect(db), 'bring'),
			deleteShopping: act((f, db) => A.deleteShopping(db, f), 'shopping')
		}
	}
});
