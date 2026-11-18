import { getSetting, readCache } from '#lib/server/sync.js';
import { weatherSource } from '#lib/server/sources/index.js';
import type { Weather } from '#lib/types.js';
import { defineServer } from '../server-types.js';

export default defineServer('weather', {
	sources: (db) => {
		const { lat, lon } = getSetting(db, 'location');
		return [weatherSource(lat, lon)];
	},
	dashboard: ({ db }) => {
		const weather = readCache<Weather>(db, 'weather');
		return { data: weather.data, status: { weather: weather.status } };
	}
});
