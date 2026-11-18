import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * --- p4: security --- PIN kiosku, usuwanie po PIN-ie i /api bez logowania.
 * „Zdalny” klient = żądanie z X-Forwarded-For (tak wygląda każde żądanie przez tailscale serve albo
 * reverse proxy); bez tego nagłówka Playwright na localhost jest kioskiem – jak Chromium na urządzeniu.
 */

const ADMIN = { 'tailscale-user-login': 'admin@test.local' };
const REMOTE = { 'x-forwarded-for': '203.0.113.7' };
const TOKEN = 'e2e-token-0123456789abcdef0123456789abcdef';
const PIN = '24680';
const SHOTS = process.env.P4_SHOTS;

test.describe.configure({ mode: 'serial' });

async function holdDown(el: Locator, ms: number) {
	const box = (await el.boundingBox())!;
	const page = el.page();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(ms);
	await page.mouse.up();
}

async function enterPin(page: Page, pin: string) {
	for (const d of pin) await page.locator(`[data-testid=pinpad] [data-key="${d}"]`).click();
	await page.locator('[data-testid=pinpad] [data-key=ok]').click();
}

async function admin(page: Page, fn: (p: Page) => Promise<void>) {
	const ctx = await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: ADMIN });
	const p = await ctx.newPage();
	await fn(p);
	await ctx.close();
}

test('/api: kiosk tak, zdalnie bez logowania 401, z loginem Tailscale albo tokenem tak', async ({ request }) => {
	expect((await request.get('/api/display')).status()).toBe(200);
	const anon = await request.get('/api/display', { headers: REMOTE });
	expect(anon.status()).toBe(401);
	expect(anon.headers()['www-authenticate']).toContain('Bearer');
	expect((await request.post('/api/notes', { headers: REMOTE, data: { text: 'x' } })).status()).toBe(401);
	expect((await request.get('/api/display', { headers: { ...REMOTE, ...ADMIN } })).status()).toBe(200);
	expect((await request.get('/api/display', { headers: { ...REMOTE, authorization: `Bearer ${TOKEN}` } })).status()).toBe(200);
	expect((await request.get('/api/display', { headers: { ...REMOTE, authorization: 'Bearer zly-token' } })).status()).toBe(401);
	// zły token nie przechodzi nawet z kiosku
	expect((await request.get('/api/display', { headers: { authorization: 'Bearer zly-token' } })).status()).toBe(401);
	// Basic od reverse proxy to nie próba tokenu – zalogowany wchodzi, anonim nadal 401
	expect((await request.get('/api/display', { headers: { ...REMOTE, ...ADMIN, authorization: 'Basic YTpi' } })).status()).toBe(200);
	expect((await request.get('/api/display', { headers: { ...REMOTE, authorization: 'Basic YTpi' } })).status()).toBe(401);
	// tryb tailscale: strony dla tailnetu jak dotąd
	expect((await request.get('/telefon', { headers: REMOTE })).status()).toBe(200);
});

test('ustawienia kiosku i PIN – tylko z ekranu kiosku', async ({ request }) => {
	expect((await request.get('/api/kiosk/settings', { headers: { ...REMOTE, ...ADMIN } })).status()).toBe(403);
	expect((await request.post('/api/kiosk/pin', { headers: { ...REMOTE, ...ADMIN }, data: { pin: '0000' } })).status()).toBe(403);
	// bez PIN-u kiosk wchodzi od razu
	expect((await request.get('/api/kiosk/settings')).status()).toBe(200);
});

test('panel: ustawienie PIN-u (zapis jako skrót)', async ({ page }) => {
	await admin(page, async (p) => {
		await p.goto('/admin/dostep');
		await expect(p.getByRole('heading', { name: 'Dostęp' })).toBeVisible();
		await expect(p.getByTestId('auth-mode')).toContainText('Tailscale');
		await expect(p.getByTestId('pin-status')).toContainText('nie jest ustawiony');
		await p.getByTestId('pin').fill('1234');
		await p.getByTestId('pin-repeat').fill('9999');
		await p.getByRole('button', { name: 'Ustaw PIN' }).click();
		await expect(p.locator('#dostep .err')).toContainText('różnią');
		await p.getByTestId('pin').fill(PIN);
		await p.getByTestId('pin-repeat').fill(PIN);
		await p.getByRole('button', { name: 'Ustaw PIN' }).click();
		await expect(p.getByTestId('pin-status')).toContainText('PIN jest ustawiony');
	});
});

test('kiosk: przytrzymanie zegara → PIN (pomyłka, potem dobry) → ustawienia', async ({ page, request }) => {
	await page.goto('/');
	const clock = page.getByTestId('clock');
	// krótki dotyk nic nie robi
	await holdDown(clock, 300);
	await expect(page.getByTestId('pinpad')).toBeHidden();
	await holdDown(clock, 2300);
	const pad = page.getByTestId('pinpad');
	await expect(pad).toBeVisible();
	await expect(pad).toContainText('PIN do ustawień');
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/pin-pad.png` });

	// API bez zgody: 403
	expect((await request.get('/api/kiosk/settings')).status()).toBe(403);

	await enterPin(page, '1111');
	await expect(pad).toContainText('Zostały 2 próby');
	await enterPin(page, PIN);
	await expect(pad).toBeHidden();
	const sheet = page.getByTestId('kiosk-settings');
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('https://kalendarz.test.ts.net/telefon');
	await expect(sheet.locator('.qr svg')).toHaveCount(2);

	// jasność na teraz → agent ekranu dostaje ją z /api/display
	await sheet.getByRole('button', { name: '25%', exact: true }).click();
	await expect(sheet.getByRole('button', { name: '25%', exact: true })).toHaveAttribute('aria-pressed', 'true');
	expect((await (await request.get('/api/display')).json()).level).toBe(25);
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/kiosk-settings.png` });
	await sheet.getByRole('button', { name: /Według planu/ }).click();
	await expect(sheet.getByRole('button', { name: /Według planu/ })).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: '✕ Zamknij' }).click();
	await expect(sheet).toBeHidden();
	// po zamknięciu zgoda wygasła – ponowne otwarcie pyta o PIN
	await holdDown(clock, 2300);
	await expect(page.getByTestId('pinpad')).toBeVisible();
	await page.getByTestId('pinpad').getByRole('button', { name: 'Anuluj' }).click();
	await expect(page.getByTestId('pinpad')).toBeHidden();
	await expect(page.getByTestId('kiosk-settings')).toBeHidden();
});

test('PIN przy usuwaniu: kartka z kiosku dopiero po PIN-ie, Cofnij zostaje', async ({ page, request }) => {
	await admin(page, async (p) => {
		await p.goto('/admin/dostep');
		await p.getByTestId('pin-on-delete').check();
		await p.locator('form[action="?/savePinOnDelete"]').getByRole('button').click();
		await expect(p.locator('#dostep .ok')).toBeVisible();
	});

	// dodanie kartki przez API kiosku
	const note = await (await request.post('/api/notes', { data: { text: 'Kartka za PIN-em', duration: '3days' } })).json();
	expect(note.id).toBeTruthy();
	// serwer: usunięcie z kiosku bez zgody → 403
	const denied = await request.delete(`/api/notes/${note.id}`, { headers: { 'content-type': 'application/json' } });
	expect(denied.status()).toBe(403);
	expect((await denied.json()).pin).toBe(true);
	// …ale telefon / panel (login Tailscale) – bez PIN-u
	expect((await request.delete('/api/notes/nie-ma-takiej', { headers: { ...ADMIN, 'content-type': 'application/json' } })).status()).not.toBe(403);

	await page.goto('/');
	await page.locator('.tile', { hasText: 'Kartki' }).locator('.note').first().click();
	const sheet = page.locator('.sheet');
	const row = sheet.locator('.notes .note', { hasText: 'Kartka za PIN-em' });
	await row.getByRole('button', { name: 'Zdejmij' }).click();
	await expect(page.getByTestId('pinpad')).toContainText('PIN do usunięcia');
	// anulowanie – kartka zostaje
	await page.getByTestId('pinpad').getByRole('button', { name: 'Anuluj' }).click();
	await expect(row).toBeVisible();

	await row.getByRole('button', { name: 'Zdejmij' }).click();
	await enterPin(page, PIN);
	await expect(row).toBeHidden();
	// Cofnij działa jak dotąd
	await page.getByRole('button', { name: '↶ Cofnij' }).click();
	await expect(row).toBeVisible();
	// drugi raz w ciągu 2 min – bez pytania, po 5 s zapis na serwerze
	await row.getByRole('button', { name: 'Zdejmij' }).click();
	await expect(page.getByTestId('pinpad')).toBeHidden();
	await expect(row).toBeHidden();
	await page.waitForTimeout(5600);
	await page.reload();
	await expect(page.locator('.note', { hasText: 'Kartka za PIN-em' })).toHaveCount(0);
});

test.afterAll(async ({ browser }) => {
	// Sprzątanie: bez PIN-u i bez „PIN przy usuwaniu” (stan wspólny dla całej aplikacji).
	const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: ADMIN });
	const p = await ctx.newPage();
	await p.goto('/admin/dostep');
	if (await p.getByTestId('pin-on-delete').isChecked()) {
		await p.getByTestId('pin-on-delete').uncheck();
		await p.locator('form[action="?/savePinOnDelete"]').getByRole('button').click();
		await expect(p.locator('#dostep .ok')).toBeVisible();
	}
	if (await p.getByTestId('remove-pin').isVisible()) {
		await p.getByTestId('remove-pin').click();
		await expect(p.getByTestId('pin-status')).toContainText('nie jest ustawiony');
	}
	await ctx.close();
});
