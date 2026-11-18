import { json } from '@sveltejs/kit';
import { searchPlaces } from '#lib/server/setup.js';
import { isCountry } from '#lib/region.js';
import { t } from '#lib/i18n/index.js';

/** Wyszukiwanie miejscowości dla pogody (Open-Meteo, po stronie serwera). Tylko w trakcie kreatora. */
export async function GET({ url }) {
	const q = url.searchParams.get('q') ?? '';
	const c = url.searchParams.get('country') ?? '';
	try {
		return json({ places: await searchPlaces(q, isCountry(c) ? c : null) });
	} catch (e) {
		console.warn(`[setup] geokodowanie: ${e instanceof Error ? e.message : e}`);
		return json({ places: [], error: t('setup.place.searchDown') }, { status: 502 });
	}
}
