import { expect, test } from '@playwright/test';

/**
 * --- p4: security --- AUTH_MODE=password na osobnym serwerze (playwright.config.ts: AUTH_PORT).
 * Projekt dokleja X-Forwarded-For do każdego żądania – jak telefon za reverse proxy. Kiosk (bez nagłówka)
 * dostaje się do API bez logowania i widzi kod pierwszego uruchomienia.
 */

const SHOTS = process.env.P4_SHOTS;
const PASSWORD = 'dlugie-haslo-domowe-1';

test.describe.configure({ mode: 'serial' });

/** Klient „kiosk”: ten sam serwer, zwykły fetch z Node – bez X-Forwarded-For dokładanego przez projekt. */
const kiosk = (path: string) => fetch(new URL(path, test.info().project.use.baseURL));

test('bez logowania: strony → /login, /api → 401, panel → /login', async ({ page, request }) => {
	expect((await request.get('/api/display')).status()).toBe(401);
	const r = await request.get('/telefon', { maxRedirects: 0 });
	expect(r.status()).toBe(303);
	expect(r.headers().location).toBe('/login?next=%2Ftelefon');
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
	await expect(page.getByTestId('login')).toBeVisible();
	// kiosk na tym samym komputerze – bez logowania
	expect((await kiosk('/api/display')).status).toBe(200);
	expect((await kiosk('/')).status).toBe(200);
	// healthcheck Dockera: publiczny, bez danych
	const health = await request.get('/healthz');
	expect(health.status()).toBe(200);
	expect(await health.json()).toEqual({ ok: true });
});

test('pierwsze uruchomienie: hasło z kodem z ekranu kiosku', async ({ page }) => {
	const code = ((await (await kiosk('/api/kiosk/settings')).json()) as { setupCode: string }).setupCode;
	expect(code).toMatch(/^\d{8}$/);

	await page.goto('/login');
	await expect(page.getByText('Hasło nie jest jeszcze ustawione')).toBeVisible();
	await page.getByTestId('setup-code').fill(code === '00000000' ? '11111111' : '00000000');
	await page.getByTestId('setup-password').fill(PASSWORD);
	await page.getByTestId('setup-repeat').fill(PASSWORD);
	await page.getByRole('button', { name: 'Ustaw hasło i zaloguj' }).click();
	await expect(page.getByRole('alert')).toContainText('Zły kod');

	await page.getByTestId('setup-code').fill(code);
	await page.getByTestId('setup-password').fill(PASSWORD);
	await page.getByTestId('setup-repeat').fill(PASSWORD);
	await page.getByRole('button', { name: 'Ustaw hasło i zaloguj' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('clock')).toBeVisible();

	const session = (await page.context().cookies()).find((c) => c.name === 'kal_session')!;
	expect(session.httpOnly).toBe(true);
	expect(session.sameSite).toBe('Lax');
	// http na localhost – bez Secure (za https z Origin/X-Forwarded-Proto: Secure)
	expect(session.secure).toBe(false);
});

test('logowanie, panel, wylogowanie, złe hasło', async ({ page }) => {
	await page.goto('/login?next=%2Fadmin%2Fdostep');
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/login.png` });
	await page.getByTestId('password').fill('zle-haslo');
	await page.getByRole('button', { name: 'Zaloguj' }).click();
	await expect(page.getByRole('alert')).toContainText('Złe hasło');

	await page.getByTestId('password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Zaloguj' }).click();
	await expect(page).toHaveURL(/\/admin\/dostep$/);
	await expect(page.getByTestId('auth-mode')).toContainText('Hasło');
	expect((await page.request.get('/api/display')).status()).toBe(200);

	// telefon: wybór domownika zapamiętany w ciasteczku, wylogowanie
	await page.goto('/telefon');
	await page.locator('.pick .chip').first().click();
	expect((await page.context().cookies()).some((c) => c.name === 'kal_member')).toBe(true);
	await page.locator('header .who').click();
	await page.getByRole('button', { name: 'Wyloguj' }).click();
	await expect(page).toHaveURL(/\/login$/);
	expect((await page.request.get('/api/display')).status()).toBe(401);
});

test('otwarte przekierowanie po logowaniu – zablokowane', async ({ page }) => {
	await page.goto('/login?next=%2F%2Fevil.example.com');
	await page.getByTestId('password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Zaloguj' }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('podrobiony nagłówek Tailscale w trybie hasła nic nie daje', async ({ browser }) => {
	const ctx = await browser.newContext({
		baseURL: test.info().project.use.baseURL,
		extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.21', 'tailscale-user-login': 'admin@test.local', 'remote-user': 'admin' }
	});
	expect((await ctx.request.get('/api/display')).status()).toBe(401);
	expect((await ctx.request.get('/admin', { maxRedirects: 0 })).status()).toBe(303);
	await ctx.close();
});
