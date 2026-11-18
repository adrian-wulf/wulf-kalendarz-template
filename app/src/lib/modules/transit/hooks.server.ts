import { act } from '#lib/server/act.js';
import { InputError } from '#lib/server/store.js';
import { refreshNow } from '#lib/server/sync.js';
import * as T from '#lib/server/transit/index.js';
import { TransitError, type StopHit } from '#lib/server/transit/types.js';
import { defineServer } from '../server-types.js';
import { providerFits } from './index.js';
import { t } from '#lib/i18n/index.js';
import { getRegion } from '#lib/region.js';

export default defineServer('transit', {
	sources: (db) => {
		const s = T.transitSource(db);
		return s ? [s] : [];
	},
	dashboard: ({ db, at }) => T.transitTile(db, at),
	admin: {
		load: async (db, { url }) => {
			const q = url.searchParams.get('q') ?? '';
			let hits: StopHit[] = [];
			let searchError: string | null = null;
			if (q)
				try {
					hits = await T.findStops(db, q);
				} catch (e) {
					searchError = e instanceof Error ? e.message : String(e);
				}
			const c = T.transitConfig(db);
			const country = getRegion().country;
			// Zapisane źródło nie pasuje do kraju (region zmieniony później) – ostrzeżenie, bez cichej zmiany.
			const providerLabel = c.provider === 'custom' ? t('transit.provider.custom') : c.provider.toUpperCase();
			const wrongCountry = providerFits(c.provider, country) ? null : { provider: providerLabel, country };
			return { transit: { q, hits, searchError, stop: T.getStop(db), provider: c.provider, wrongCountry, gtfs: await T.gtfsInfo(), tile: T.transitTile(db, new Date()).data } };
		},
		actions: {
			pickStop: act(async (f, db) => {
				const id = String(f.get('id') ?? '').trim();
				const name = String(f.get('name') ?? '').trim();
				if (!id || !name || id.length > 200 || name.length > 200) throw new InputError('?');
				T.setStop(db, { provider: T.transitConfig(db).provider as T.ProviderId, id, name });
				await refreshNow(db, 'transit');
			}, 'transitStop'),
			clearStop: act((_, db) => T.setStop(db, null), 'transitStop'),
			uploadGtfs: act(async (f, db) => {
				const file = f.get('file');
				if (!(file instanceof File) || !file.size) throw new InputError('GTFS?');
				try {
					await T.saveGtfsUpload(await file.arrayBuffer());
				} catch (e) {
					if (e instanceof TransitError) throw new InputError(e.message);
					throw e;
				}
				await refreshNow(db, 'transit');
			}, 'gtfs'),
			refreshTransit: act(async (_, db) => void (await refreshNow(db, 'transit')), 'transitStop')
		}
	}
});
