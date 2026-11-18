import { expect, test, type Page } from '@playwright/test';

/**
 * Posiłki, zadania dzieci i odliczanie: włączenie w panelu, użycie na kiosku i telefonie, wyłączenie.
 * Moduły są domyślnie wyłączone – plik działa w osobnym projekcie (patrz playwright.config.ts) i na końcu
 * zostawia je wyłączone, jak zastał.
 */
test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });
test.describe.configure({ mode: 'serial' });

const IDS = ['meals', 'kids', 'countdown'];

async function setModule(page: Page, id: string, on: boolean) {
	await page.goto('/admin');
	const row = page.locator(`#moduly [data-module=${id}]`);
	await row.getByRole('button', { name: on ? 'Włącz' : 'Wyłącz' }).click();
	await expect(row.getByRole('button', { name: on ? 'Wyłącz' : 'Włącz' })).toBeVisible();
}

test('włączenie w panelu: kafelki na kiosku, zakładki na telefonie, sekcje panelu', async ({ page, request }) => {
	expect((await request.get('/telefon/posilki')).status()).toBe(404);
	for (const id of IDS) await setModule(page, id, true);
	await expect(page.locator('#admin-nav')).toContainText('Posiłki');
	await expect(page.locator('#admin-nav')).toContainText('Dzieci');
	await expect(page.locator('#admin-nav')).toContainText('Odliczanie');

	await page.goto('/');
	await expect(page.locator('[data-tile]')).toHaveCount(6);
	await expect(page.locator('[data-tile=meal]')).toContainText('Spaghetti bolognese'); // dane przykładowe: dziś
	await expect(page.locator('[data-tile=kids]')).toContainText('Ola');
	await expect(page.locator('[data-tile=countdown]')).toContainText('Urodziny Oli');
	for (const path of ['/telefon/posilki', '/telefon/dzieci', '/telefon/odliczanie', '/admin/posilki', '/admin/dzieci', '/admin/odliczanie'])
		expect((await request.get(path)).status(), path).toBe(200);
});

test('posiłki na kiosku: wybór dania z przepisów, brakujące składniki na listę zakupów', async ({ page }) => {
	await page.goto('/');
	await page.locator('[data-tile=meal]').click();
	await expect(page.getByRole('heading', { name: /Plan posiłków/ })).toBeVisible();
	const empty = page.locator('.cell.empty').first();
	const key = await empty.getAttribute('data-meal');
	await empty.click();
	await page.getByRole('button', { name: /Pizza domowa/ }).click();
	await expect(page.locator(`[data-meal="${key}"]`)).toContainText('Pizza domowa');

	await page.getByRole('button', { name: /Brakujące na listę/ }).click();
	await expect(page.locator('.miss', { hasText: 'mozzarella' })).toBeVisible();
	await page.locator('.miss', { hasText: 'parmezan' }).click(); // odznaczony – nie trafi na listę
	await page.getByRole('button', { name: /Dodaj \d+ pozycj/ }).click();
	await expect(page.getByText(/Na liście zakupów:.*mozzarella/)).toBeVisible();
	await page.getByRole('button', { name: /Zamknij/ }).click();

	await page.locator('[data-tile=shopping]').click();
	await expect(page.locator('.shop')).toContainText('mozzarella');
	await expect(page.locator('.shop')).not.toContainText('parmezan');
});

test('dzieci na kiosku: odhaczenie dotykiem daje punkty, cofnięcie je zabiera; zgoda na nagrodę tylko dla rodzica', async ({ page, playwright, baseURL }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	await page.locator('[data-tile=kids]').click();
	const kuba = page.locator('[data-kid=kuba]');
	await expect(kuba.locator('[data-points]')).toHaveText('6 ⭐');
	const task = kuba.getByRole('button', { name: /Umyj zęby/ });
	await task.click();
	await expect(task).toHaveAttribute('aria-pressed', 'true');
	await expect(kuba.locator('[data-points]')).toHaveText('7 ⭐');
	await expect(kuba.locator('.cheer')).toContainText('+1 ⭐');
	await task.click();
	await expect(task).toHaveAttribute('aria-pressed', 'false');
	await expect(kuba.locator('[data-points]')).toHaveText('6 ⭐');

	// Ola czeka na „30 minut tabletu” (dane przykładowe) – kiosk ani telefon bez panelu nie mogą się zgodzić.
	const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: {} });
	const id = Number(await (await page.request.get('/api/kids')).json().then((s) => s.pending[0].id));
	expect((await anon.post('/api/kids/decide', { data: { id, approve: true } })).status()).toBe(403);
	await anon.dispose();

	await page.goto('/admin/dzieci');
	await page.locator(`[data-request="${id}"]`).getByRole('button', { name: /Zgoda/ }).click();
	await expect(page.getByText('Nikt nie czeka na nagrodę.')).toBeVisible();
	const ola = page.locator('form', { has: page.locator('[data-points=ola]') });
	await ola.locator('input[name=delta]').fill('5');
	await ola.getByRole('button', { name: 'Zapisz' }).click();
	await expect(page.locator('[data-points=ola]')).toContainText('13');

	// Prośba z kiosku: Ola ma 13, tablet kosztuje 10.
	await page.goto('/');
	await page.locator('[data-tile=kids]').click();
	await page.getByRole('tab', { name: /Nagrody/ }).click();
	await page.getByRole('button', { name: /Ola · 13/ }).click();
	await expect(page.getByRole('button', { name: /Wyjście do kina/ })).toBeDisabled();
	await page.getByRole('button', { name: /30 minut tabletu/ }).click();
	await page.getByRole('button', { name: /Poproś o nagrodę/ }).click();
	await expect(page.getByText('Prośba wysłana: 📱 30 minut tabletu')).toBeVisible();
	await expect(page.getByText('Czeka na zgodę rodzica')).toBeVisible();
});

test('odliczanie: dodanie na telefonie, najbliższe na kafelku kiosku, usunięcie', async ({ browser, page }) => {
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	const p = await phone.newPage();
	await p.goto('/telefon/odliczanie');
	await p.getByRole('button', { name: 'Dodaj odliczanie' }).click();
	await p.getByPlaceholder('np. Wakacje').fill('Ferie zimowe');
	await p.getByRole('button', { name: '⛷️' }).click();
	const inThree = await p.evaluate(() => {
		const d = new Date();
		d.setDate(d.getDate() + 3);
		return d.toLocaleDateString('sv-SE');
	});
	await p.locator('input[type=date]').fill(inThree);
	await p.getByRole('button', { name: '✓ Dodaj odliczanie' }).click();
	const card = p.locator('.cd', { hasText: 'Ferie zimowe' });
	await expect(card).toContainText('za 3 dni');

	await page.goto('/');
	await expect(page.locator('[data-tile=countdown] .row').first()).toContainText('Ferie zimowe');
	await page.locator('[data-tile=countdown]').click();
	await expect(page.locator('.card', { hasText: 'Ferie zimowe' })).toContainText('3');

	await card.getByRole('button', { name: /Usuń/ }).click();
	await expect(card).toHaveCount(0);
	await p.waitForTimeout(5500); // usunięcie zapisuje się po 5 s (cofnij)
	await phone.close();
});

for (const [preset, w, h] of [
	['today-week', 1920, 1080],
	['portrait', 1080, 1920],
	['small', 1280, 800]
] as const)
	test(`sześć kafelków mieści się w układzie ${preset}`, async ({ browser }) => {
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		await page.goto(`/?layout=${preset}`);
		await expect(page.locator('[data-tile]')).toHaveCount(6);
		const overflow = await page.evaluate(() => {
			const m = document.querySelector('main')!;
			return { w: m.scrollWidth - m.clientWidth, h: m.scrollHeight - m.clientHeight };
		});
		expect(overflow).toEqual({ w: 0, h: 0 });
		for (const el of await page.locator('[data-tile]').all()) {
			const b = (await el.boundingBox())!;
			expect(b.width, 'szerokość kafelka').toBeGreaterThan(preset === 'small' ? 130 : 200);
			expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
			expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
		}
		await ctx.close();
	});

test('wyłączenie: kafelki znikają, trasy 404', async ({ page, request }) => {
	for (const id of IDS) await setModule(page, id, false);
	await page.goto('/');
	await expect(page.locator('[data-tile]')).toHaveCount(3);
	for (const path of ['/telefon/posilki', '/api/kids', '/admin/odliczanie']) expect((await request.get(path)).status(), path).toBe(404);
});
