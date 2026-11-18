import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { isBusy } from '#lib/server/backup.js';

/**
 * Stan serwera dla HEALTHCHECK Dockera i monitoringu: bez logowania, bez danych – tylko ping bazy.
 * Health check for Docker and monitoring: public, no data, just a database ping.
 */
export function GET() {
	// W trakcie przywracania baza jest zablokowana – to nie awaria.
	if (isBusy() === 'restore') return json({ ok: true, restoring: true }, { headers: { 'cache-control': 'no-store' } });
	try {
		getDb().$client.prepare('SELECT 1').get();
		return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
}
