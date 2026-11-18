import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { runtimeAuth } from '#lib/server/auth-runtime.js';
import { checkPin, hasPin, pinGrant, PIN_COOKIE, PIN_GRANT_MS } from '#lib/server/security.js';
import { t } from '#lib/i18n/index.js';

/**
 * PIN z klawiatury kiosku: `{ pin }` → zgoda na 2 min (ciasteczko HttpOnly, SameSite=Strict).
 * Tylko z kiosku; pomyłki ograniczone (3 za darmo, potem rosnąca przerwa) – patrz security.ts.
 */
export async function POST({ request, locals, cookies }) {
	if (!locals.auth.kiosk) error(403, t('sec.kioskOnly'));
	const db = getDb();
	if (!hasPin(db)) return json({ ok: true, ttl: PIN_GRANT_MS, pin: false });
	let pin = '';
	try {
		pin = String(((await request.json()) as { pin?: unknown }).pin ?? '');
	} catch {
		error(400, t('err.json'));
	}
	const r = await checkPin(db, pin);
	if (!r.ok) return json({ ok: false, retryMs: r.retryMs, left: r.left }, { status: r.retryMs && !r.left ? 429 : 401 });
	cookies.set(PIN_COOKIE, pinGrant(db, runtimeAuth()), { path: '/', httpOnly: true, sameSite: 'strict', secure: false, maxAge: PIN_GRANT_MS / 1000 });
	return json({ ok: true, ttl: PIN_GRANT_MS, pin: true });
}

/** Zamknięcie ustawień – zgoda przestaje działać od razu. */
export function DELETE({ cookies }) {
	cookies.delete(PIN_COOKIE, { path: '/', secure: false });
	return json({ ok: true });
}
