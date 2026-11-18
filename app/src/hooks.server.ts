import { error, json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { getDb } from '#lib/server/db/index.js';
import { applyRegion, startSync } from '#lib/server/sync.js';
// --- p4: security ---
import { access, identify } from '#lib/server/auth.js';
import { runtimeAuth } from '#lib/server/auth-runtime.js';
import { cachedWhois, verifiedTailscaleLogin } from '#lib/server/tailscale-whois.js';
import { firstRunCode, hasPinGrant, migratePlainPin, pinOnDelete, PIN_COOKIE, SESSION_COOKIE, sessionLogin } from '#lib/server/security.js';
import { pinGuarded } from '#lib/server/pin-guard.js';
import { backupDir, blockedByRestore, startBackups } from '#lib/server/backup.js';
import { blockedRoutes, seedModules } from '#lib/modules/registry.server.js';
import { isPathDisabled } from '#lib/modules/index.js';
import { initSetup, setupPending } from '#lib/server/setup.js';
import { getSetting } from '#lib/server/sync.js';
import { getLang, setLang, t } from '#lib/i18n/index.js';
// --- demo ---
import { applyDemoEnv, demoLockedRoute, isDemo } from '#lib/server/demo/mode.js';
import { startDemo } from '#lib/server/demo/load.js';

// --- p4: security --- tryb logowania z .env (AUTH_MODE, …) – czytany raz przy starcie.
const auth = runtimeAuth();
const whoisLookup = auth.tailscaleWhois ? cachedWhois(auth.tailscaleWhois) : null;

if (!building) {
	// Tryb demo: własna baza i zdjęcia obok zwykłych (przed pierwszym otwarciem bazy), dane od zera.
	if (isDemo()) applyDemoEnv();
	const db = getDb();
	if (isDemo()) await startDemo(db);
	applyRegion(db);
	setLang(getSetting(db, 'language'));
	initSetup(db);
	seedModules(db);
	startSync(db);
	// Demo nie robi kopii zapasowych (baza i tak wraca do stanu demo co noc).
	if (!isDemo()) startBackups(db, backupDir(process.env.DATABASE_PATH ?? 'data/kalendarz.db'));
	// --- p4: security ---
	await migratePlainPin(db);
	for (const w of auth.warnings) console.warn(`[auth] ${w}`);
	console.log(`[auth] tryb: ${auth.mode}${auth.tailscaleWhois ? `, whois przez ${auth.tailscaleWhois}` : ''}${auth.apiToken ? ', API_TOKEN ustawiony' : ''}${auth.kioskLocal ? '' : ', kiosk bez wyjątku (KIOSK_LOCAL=0)'}`);
	const code = firstRunCode(db, auth);
	if (code) console.log(`[auth] Hasło nie jest ustawione. Kod do pierwszego ustawienia (strona /login): ${code}`);
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	// --- p4: backups --- przywracanie podmienia bazę – chwilowo 503 zamiast błędów SQLITE_BUSY.
	if (blockedByRestore(path)) {
		const message = t('p4.backup.restoringNow');
		if (path === '/api' || path.startsWith('/api/')) return json({ message, restoring: true }, { status: 503, headers: { 'retry-after': '5' } });
		error(503, message);
	}
	// Język z ustawień na każde żądanie (zmiana w panelu albo kreatorze działa od razu).
	setLang(getSetting(getDb(), 'language'));
	// Kreator pierwszego uruchomienia: kiosk trafia na /setup, a po zakończeniu /setup znika (404).
	if (path === '/setup' || path.startsWith('/setup/')) {
		if (!setupPending(getDb())) error(404, t('error.notFound'));
	} else if (path === '/' && setupPending(getDb())) redirect(303, '/setup');
	// --- p4: security --- kto pyta (kiosk / Tailscale / proxy / sesja / token) i czy może tu wejść.
	let ip = '';
	try {
		ip = event.getClientAddress();
	} catch {
		/* brak adresu = obcy */
	}
	const req = { ip, headers: event.request.headers };
	// Tailscale + gniazdo tailscaled: login z nagłówka musi zgadzać się z whois adresu klienta.
	const verified = await verifiedTailscaleLogin(req, auth, whoisLookup);
	const who = identify(req, auth, auth.mode === 'password' ? sessionLogin(getDb(), auth, event.cookies.get(SESSION_COOKIE)) : null, verified);
	event.locals.auth = who;
	event.locals.authMode = auth.mode;
	if (who.admin) event.locals.admin = who.login ?? 'dev@localhost';
	const verdict = access(path, who, auth);
	if (verdict === 'unauthorized' && (path === '/api' || path.startsWith('/api/')))
		return json({ message: t('sec.unauthorized') }, { status: 401, headers: { 'www-authenticate': 'Bearer realm="kalendarz"' } });
	if (verdict === 'unauthorized') error(401, t('sec.unauthorized'));
	if (verdict === 'login') redirect(303, `/login?next=${encodeURIComponent(path + event.url.search)}`);
	if (verdict === 'forbidden') error(403, t('error.adminOnly'));
	// Usuwanie z kiosku po PIN-ie (panel → Dostęp → „PIN przy usuwaniu”); telefon i panel – bez PIN-u.
	if (who.kiosk && !who.login && pinGuarded(event.request.method, path) && pinOnDelete(getDb()) && !hasPinGrant(getDb(), auth, event.cookies.get(PIN_COOKIE)))
		return json({ message: t('sec.pinRequired'), pin: true }, { status: 403 });
	// Demo: logowanie Google i wgrywanie kopii zamknięte (publiczne demo nie łączy się z cudzymi kontami).
	if (isDemo() && demoLockedRoute(path)) error(403, t('demo.locked'));
	// Strony i API wyłączonych modułów (prefiksy z manifestów) – jakby ich nie było.
	if (isPathDisabled(path, blockedRoutes(getDb()))) error(404, t('error.moduleOff'));
	// Język strony w <html lang> – po resolve, bo kreator może go właśnie zmienić.
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', getLang()) });
};
