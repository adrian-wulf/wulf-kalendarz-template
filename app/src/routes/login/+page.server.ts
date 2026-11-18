import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { runtimeAuth } from '#lib/server/auth-runtime.js';
import { clientAddress, secureCookie } from '#lib/server/auth.js';
import { createSession, firstRunCode, passwordHash, SESSION_COOKIE, setFirstPassword, tryLogin } from '#lib/server/security.js';
import { InputError } from '#lib/server/store.js';
import { t } from '#lib/i18n/index.js';

/**
 * Logowanie w trybie `AUTH_MODE=password`. W innych trybach strony nie ma (404).
 * Bez hasła: pierwsze ustawienie z kodem z ekranu kiosku (albo z logów serwera).
 */

/** Tylko ścieżki tej aplikacji – bez `//host` i `/\host` (otwarte przekierowanie). */
function safeNext(v: string | null): string {
	if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.startsWith('/login')) return '/';
	return v;
}

export function load({ locals, url }) {
	const auth = runtimeAuth();
	if (auth.mode !== 'password') error(404, t('error.notFound'));
	const next = safeNext(url.searchParams.get('next'));
	if (locals.auth.login) redirect(303, next);
	return { next, needsSetup: !!firstRunCode(getDb(), auth), kiosk: locals.auth.kiosk };
}

type Ev = { request: Request; cookies: import('@sveltejs/kit').Cookies; getClientAddress: () => string };

function startSession({ request, cookies, getClientAddress }: Ev) {
	const auth = runtimeAuth();
	cookies.set(SESSION_COOKIE, createSession(getDb(), auth), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie({ ip: getClientAddress(), headers: request.headers }, auth),
		maxAge: auth.sessionDays * 86_400
	});
}

const waitMsg = (ms: number) => t('sec.err.wait', { s: Math.ceil(ms / 1000) });

export const actions = {
	login: async (e) => {
		const auth = runtimeAuth();
		if (auth.mode !== 'password') error(404, t('error.notFound'));
		const f = await e.request.formData();
		const next = safeNext(String(f.get('next') ?? ''));
		if (!passwordHash(getDb(), auth)) return fail(400, { error: t('sec.err.noPassword'), next });
		const client = clientAddress({ ip: e.getClientAddress(), headers: e.request.headers }, auth);
		const r = await tryLogin(getDb(), auth, String(f.get('password') ?? ''), client);
		// `next` wraca z błędem: bez JavaScriptu strona po POST nie ma go w adresie.
		if (!r.ok) return fail(r.retryMs ? 429 : 401, { error: r.retryMs ? `${t('sec.err.badPassword')} ${waitMsg(r.retryMs)}` : t('sec.err.badPassword'), next });
		startSession(e);
		redirect(303, next);
	},
	setup: async (e) => {
		const auth = runtimeAuth();
		if (auth.mode !== 'password') error(404, t('error.notFound'));
		const f = await e.request.formData();
		const client = clientAddress({ ip: e.getClientAddress(), headers: e.request.headers }, auth);
		try {
			const r = await setFirstPassword(getDb(), auth, String(f.get('code') ?? ''), String(f.get('password') ?? ''), String(f.get('repeat') ?? ''), client);
			if (!r.ok) return fail(r.retryMs ? 429 : 401, { error: r.retryMs ? `${t('sec.err.badCode')} ${waitMsg(r.retryMs)}` : t('sec.err.badCode') });
		} catch (err) {
			if (err instanceof InputError) return fail(400, { error: err.message });
			throw err;
		}
		startSession(e);
		redirect(303, '/');
	}
};
