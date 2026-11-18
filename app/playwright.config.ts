import { defineConfig } from '@playwright/test';

// E2E_PORT – inny port, gdy 4173 jest zajęty (np. równoległe przebiegi z innego katalogu).
const PORT = Number(process.env.E2E_PORT ?? 4173);
// Druga instancja na świeżej bazie – kreator pierwszego uruchomienia (bez SKIP_SETUP).
const SETUP_PORT = PORT + 2;
const GEO_PORT = PORT + 3;
// Atrapy odjazdów (HAFAS, GTFS) i Home Assistanta dla testów modułów p3c.
const P3C_MOCK_PORT = PORT + 10;
// --- p4: backups --- osobna instancja (przywracanie podmienia całą bazę) i atrapa WebDAV.
const BACKUP_PORT = PORT + 20;
const WEBDAV_PORT = PORT + 21;
// --- p4: security --- osobna instancja w trybie AUTH_MODE=password (logowanie hasłem).
const AUTH_PORT = PORT + 6;
// --- demo --- tryb demo (DEMO=1) i zwykła instalacja do „Wczytaj dane przykładowe”.
const DEMO_PORT = PORT + 30;
const SAMPLE_PORT = PORT + 31;
// --- 26a: calendar layers --- atrapa serwera iCal (subskrypcje).
const ICAL_PORT = PORT + 40;
/** Token API głównego serwera testów (Authorization: Bearer). */
const E2E_API_TOKEN = 'e2e-token-0123456789abcdef0123456789abcdef';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1920, height: 1080 }, hasTouch: true },
	projects: [
		// Wszystko, co nie zmienia stanu całej aplikacji – równolegle.
		{ name: 'main', testIgnore: /(modules|setup|layout-admin|lang|p3b|backup|security|auth-password|demo|calendars|guides)\.test\.ts/ },
		// Przełączanie modułów zmienia stan całej aplikacji – po reszcie, jeden plik naraz (workers: 1),
		// kolejne grupy po sobie: modules → p3b → p3c → layout → lang.
		{ name: 'modules', testMatch: /(^|\/)(p3a-)?modules\.test\.ts$/, dependencies: ['main'], fullyParallel: false, workers: 1 },
		// p3b: posiłki, dzieci, odliczanie – włącza i wyłącza swoje moduły.
		{ name: 'p3b', testMatch: /p3b\.test\.ts$/, dependencies: ['modules'], fullyParallel: false, workers: 1 },
		// p3c: leki, opieka, odjazdy, Home Assistant (pliki *.modules.test.ts, atrapy z e2e/p3c-mock.mjs).
		{ name: 'p3c', testMatch: /\.modules\.test\.ts$/, dependencies: ['p3b'], fullyParallel: false, workers: 1 },
		// Kreator: osobny serwer i baza, kroki po kolei.
		{ name: 'setup', testMatch: /setup\.test\.ts/, fullyParallel: false, use: { baseURL: `http://localhost:${SETUP_PORT}` } },
		// Układ ekranu też jest globalny – na końcu.
		{ name: 'layout', testMatch: /layout-admin\.test\.ts/, dependencies: ['p3c'] },
		// Język interfejsu też jest globalny – po układzie, na końcu wraca polski.
		{ name: 'lang', testMatch: /lang\.test\.ts/, dependencies: ['layout'], fullyParallel: false },
		// --- p4: backups --- własny serwer i baza, kroki po kolei.
		{ name: 'backup', testMatch: /backup\.test\.ts/, fullyParallel: false, use: { baseURL: `http://localhost:${BACKUP_PORT}` } },
		// --- p4: security --- PIN kiosku zmienia stan całej aplikacji – po wszystkim, na końcu PIN usunięty.
		{ name: 'security', testMatch: /security\.test\.ts/, dependencies: ['lang'], fullyParallel: false, workers: 1 },
		// --- 26a: calendar layers --- kalendarze (ukrycie na kiosku, import) – po głównych testach, po kolei.
		{ name: 'calendars', testMatch: /calendars\.test\.ts/, dependencies: ['main'], fullyParallel: false, workers: 1 },
		// --- 26b: guides --- lista „Co jeszcze możesz podłączyć” zależy od stanu całej aplikacji – na samym końcu.
		{ name: 'guides', testMatch: /guides\.test\.ts/, dependencies: ['security'], fullyParallel: false, workers: 1 },
		// --- demo --- własne serwery (demo i zwykła instalacja) – niezależnie od reszty.
		{ name: 'demo', testMatch: /demo\.test\.ts/, fullyParallel: false, use: { baseURL: `http://localhost:${DEMO_PORT}` } },
		// Tryb hasła: osobny serwer i baza; „zdalny” klient = nagłówek X-Forwarded-For (przez proxy kiosk nigdy nie jest).
		{
			name: 'auth-password',
			testMatch: /auth-password\.test\.ts/,
			fullyParallel: false,
			use: { baseURL: `http://localhost:${AUTH_PORT}`, extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.20' } }
		}
	],
	// Serwery startują po kolei – drugi korzysta z gotowego builda pierwszego.
	webServer: [
		{
			command: 'rm -f data/e2e.db* data/e2e-setup.db* data/e2e-auth.db* && npm run build && node server',
			port: PORT,
			// SKIP_SETUP: świeża baza z danymi przykładowymi, bez kreatora (jak przed kreatorem).
			env: { PORT: String(PORT), DATABASE_PATH: 'data/e2e.db', ADMIN_LOGINS: 'admin@test.local', TRUSTED_ORIGINS: `http://localhost:${PORT}`, SKIP_SETUP: '1', TAILSCALE_WHOIS: '0', API_TOKEN: E2E_API_TOKEN, PUBLIC_ORIGIN: 'https://kalendarz.test.ts.net', ICAL_ALLOW_PRIVATE: '1' },
			reuseExistingServer: false,
			timeout: 120_000
		},
		{
			command: `node e2e/ical-mock.mjs ${ICAL_PORT}`,
			port: ICAL_PORT,
			reuseExistingServer: false
		},
		{
			command: `node e2e/geocode-mock.mjs ${GEO_PORT}`,
			port: GEO_PORT,
			reuseExistingServer: false
		},
		{
			command: 'node server',
			port: SETUP_PORT,
			env: {
				PORT: String(SETUP_PORT),
				DATABASE_PATH: 'data/e2e-setup.db',
				ADMIN_LOGINS: 'admin@test.local',
				// Bez TRUSTED_ORIGINS (jak `npm start` bez Dockera) – formularze kreatora muszą przejść z domyślnym adresem lokalnym.
				GEOCODING_URL: `http://localhost:${GEO_PORT}/v1/search`,
				PUBLIC_ORIGIN: 'https://kalendarz.test.ts.net'
			},
			reuseExistingServer: false,
			timeout: 60_000
		},
		// --- p4: security ---
		{
			command: 'node server',
			port: AUTH_PORT,
			env: { PORT: String(AUTH_PORT), DATABASE_PATH: 'data/e2e-auth.db', AUTH_MODE: 'password', TRUSTED_ORIGINS: `http://localhost:${AUTH_PORT}`, SKIP_SETUP: '1' },
			reuseExistingServer: false,
			timeout: 60_000
		},
		// --- p3c: care, transit, home assistant ---
		{
			command: `node e2e/p3c-mock.mjs ${P3C_MOCK_PORT}`,
			port: P3C_MOCK_PORT,
			reuseExistingServer: false
		},
		// --- p4: backups ---
		{
			command: 'rm -rf data/e2e-backup.db* data/e2e-backup-media data/e2e-backup-kopie && node server',
			port: BACKUP_PORT,
			env: {
				PORT: String(BACKUP_PORT),
				DATABASE_PATH: 'data/e2e-backup.db',
				MEDIA_DIR: 'data/e2e-backup-media',
				BACKUP_DIR: 'data/e2e-backup-kopie',
				ADMIN_LOGINS: 'admin@test.local',
				TRUSTED_ORIGINS: `http://localhost:${BACKUP_PORT}`,
				SKIP_SETUP: '1'
			},
			reuseExistingServer: false,
			timeout: 60_000
		},
		{
			command: `node e2e/webdav-mock.mjs ${WEBDAV_PORT}`,
			port: WEBDAV_PORT,
			reuseExistingServer: false
		},
		// --- demo --- DEMO=1: baza demo powstaje od zera przy starcie (data/e2e-demo/demo/…), bez sieci.
		{
			command: 'node server',
			port: DEMO_PORT,
			env: {
				PORT: String(DEMO_PORT),
				DATABASE_PATH: 'data/e2e-demo/kalendarz.db',
				DEMO: '1',
				DEMO_LANG: 'pl',
				DEMO_RESET: 'off',
				ADMIN_LOGINS: 'admin@test.local',
				TRUSTED_ORIGINS: `http://localhost:${DEMO_PORT}`
			},
			reuseExistingServer: false,
			timeout: 60_000
		},
		{
			command: 'rm -f data/e2e-sample.db* && node server',
			port: SAMPLE_PORT,
			env: { PORT: String(SAMPLE_PORT), DATABASE_PATH: 'data/e2e-sample.db', SKIP_SETUP: '1', ADMIN_LOGINS: 'admin@test.local', TRUSTED_ORIGINS: `http://localhost:${SAMPLE_PORT}` },
			reuseExistingServer: false,
			timeout: 60_000
		}
	]
});
