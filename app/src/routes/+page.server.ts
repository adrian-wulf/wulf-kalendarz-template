import { getDb } from '#lib/server/db/index.js';
import { buildDashboard } from '#lib/server/dashboard.js';

export function load({ url }) {
	// ?at=ISO pozwala zamrozić czas (testy wizualne, podgląd).
	const at = url.searchParams.get('at');
	return { dashboard: buildDashboard(getDb(), at ? new Date(at) : new Date()) };
}
