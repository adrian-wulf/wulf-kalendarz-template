import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '#lib/server/db/index.js';
import { authUrl, getClient, googleRedirectUri } from '#lib/server/google.js';
import { t } from '#lib/i18n/index.js';

/** Start logowania Google: losowy `state` w ciasteczku chroni przed podrobionym powrotem. */
export function GET({ cookies, url }) {
	const client = getClient(getDb());
	if (!client) error(400, t('google.err.noClient'));
	const state = randomUUID();
	cookies.set('g_state', state, { path: '/admin', httpOnly: true, sameSite: 'lax', maxAge: 600 });
	// redirect() w SvelteKit 3 nie pozwala na obce domeny – przekierowanie do Google ręcznie.
	return new Response(null, { status: 302, headers: { location: authUrl(client, state, googleRedirectUri(url.origin)) } });
}
