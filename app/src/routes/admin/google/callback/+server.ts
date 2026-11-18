import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { exchangeCode, googleRedirectUri } from '#lib/server/google.js';
import { refreshNow } from '#lib/server/sync.js';
import { t } from '#lib/i18n/index.js';

export async function GET({ url, cookies }) {
	const expected = cookies.get('g_state');
	cookies.delete('g_state', { path: '/admin' });
	const fail = (msg: string) => redirect(303, `/admin/google?google_error=${encodeURIComponent(msg)}`);

	if (url.searchParams.get('error')) fail(t('google.err.denied', { error: String(url.searchParams.get('error')) }));
	const code = url.searchParams.get('code');
	if (!code || !expected || url.searchParams.get('state') !== expected) fail(t('google.err.state'));

	try {
		await exchangeCode(getDb(), code!, googleRedirectUri(url.origin));
	} catch (e) {
		fail(e instanceof Error ? e.message : t('google.err.connect'));
	}
	await refreshNow(getDb(), 'google');
	redirect(303, '/admin/google?google=ok');
}
