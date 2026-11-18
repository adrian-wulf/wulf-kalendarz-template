import { expect, test, type Page } from '@playwright/test';

/**
 * Włączanie i wyłączanie modułów zmienia stan całej aplikacji – ten plik działa w osobnym
 * projekcie Playwrighta, po wszystkich pozostałych testach (patrz playwright.config.ts).
 */
test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });

const moduleRow = (page: Page, id: string) => page.locator(`#moduly [data-module=${id}]`);

async function setModule(page: Page, id: string, on: boolean) {
	await page.goto('/admin');
	const row = moduleRow(page, id);
	await row.getByRole('button', { name: on ? 'Włącz' : 'Wyłącz' }).click();
	await expect(row.getByRole('button', { name: on ? 'Wyłącz' : 'Włącz' })).toBeVisible();
}

test('wyłączenie węży: znikają z kiosku, telefonu i panelu, trasy 404; włączenie przywraca', async ({ page, request, browser }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Węże' })).toBeVisible();

	await setModule(page, 'snakes', false);
	await expect(page.locator('#admin-nav')).not.toContainText('Węże');

	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Zapasy' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Węże' })).toHaveCount(0);

	for (const path of ['/weze', '/telefon/weze', '/admin/weze']) expect((await request.get(path)).status(), path).toBe(404);
	expect((await request.post('/api/snakes/stock', { data: { foodId: 'x', delta: 1 } })).status()).toBe(404);

	const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p = await phone.newPage();
	await p.goto('/telefon/kartki');
	await expect(p.locator('nav a', { hasText: 'Kartki' })).toBeVisible();
	await expect(p.locator('nav a', { hasText: 'Węże' })).toHaveCount(0);

	await setModule(page, 'snakes', true);
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Węże' })).toBeVisible();
	expect((await request.get('/weze')).status()).toBe(200);
	await p.reload();
	await expect(p.locator('nav a', { hasText: 'Węże' })).toBeVisible();
	await phone.close();
});

test('zależność: bez zakupów zapasy nie działają, panel ostrzega', async ({ page, request }) => {
	// Wyłączenie modułu, od którego zależą inne, pyta o potwierdzenie.
	page.on('dialog', (d) => d.accept());
	await setModule(page, 'shopping', false);
	await expect(page.locator('#moduly .err')).toContainText('Zapasy potrzebuje modułu „Zakupy”');
	await expect(moduleRow(page, 'pantry')).toContainText('brak zależności');
	expect((await request.get('/zapasy')).status()).toBe(404);
	await page.goto('/');
	await expect(page.locator('.tile', { hasText: 'Zakupy' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Zapasy' })).toHaveCount(0);
	await setModule(page, 'shopping', true);
	expect((await request.get('/zapasy')).status()).toBe(200);
});

test('kolejność modułów: gry przed zapasami na kiosku', async ({ page }) => {
	await page.goto('/admin');
	const labels = () => page.locator('.week .nav a.launcher').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
	const rows = page.locator('#moduly .module');
	// Plac zabaw nie musi być ostatni (nowe moduły dochodzą na końcu rejestru).
	const last = await rows.evaluateAll((els) => els.findIndex((e) => (e as HTMLElement).dataset.module === 'playground'));
	for (let i = 1; i <= 2; i++) {
		await moduleRow(page, 'playground').getByRole('button', { name: 'Plac zabaw w górę' }).click();
		await expect(rows.nth(last - i)).toHaveAttribute('data-module', 'playground');
	}
	await page.goto('/');
	expect(await labels()).toEqual(['Gry', 'Zapasy', 'Węże']);
	await page.goto('/admin');
	for (let i = 1; i <= 2; i++) {
		await moduleRow(page, 'playground').getByRole('button', { name: 'Plac zabaw w dół' }).click();
		await expect(rows.nth(last - 2 + i)).toHaveAttribute('data-module', 'playground');
	}
	await page.goto('/');
	expect(await labels()).toEqual(['Zapasy', 'Węże', 'Gry']);
});

test('ustawienia modułu ze schematu: zapasy', async ({ page }) => {
	await page.goto('/admin/zapasy');
	const cfg = page.locator('#ustawienia-modulu');
	await expect(cfg.locator('input[name=expiryWarnDays]')).toHaveValue('7');
	await cfg.locator('input[name=expiryWarnDays]').fill('10');
	await cfg.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await expect(cfg.locator('.ok')).toBeVisible();
	await page.reload();
	await expect(cfg.locator('input[name=expiryWarnDays]')).toHaveValue('10');
	await cfg.locator('input[name=expiryWarnDays]').fill('7');
	await cfg.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await expect(cfg.locator('.ok')).toBeVisible();
});

test('panel na telefonie: menu zwinięte, rozwija się przyciskiem', async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });
	const page = await ctx.newPage();
	await page.goto('/admin/zadania');
	await expect(page.locator('#admin-nav')).toBeHidden();
	await page.getByRole('button', { name: /Zadania/ }).click();
	await page.locator('#admin-nav').getByRole('link', { name: 'Kartki' }).click();
	await expect(page).toHaveURL(/\/admin\/kartki$/);
	await expect(page.locator('#admin-nav')).toBeHidden();
	await expect(page.getByRole('heading', { name: /Kartki/ })).toBeVisible();
	await ctx.close();
});
