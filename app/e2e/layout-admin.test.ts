import { expect, test } from '@playwright/test';

// Zmienia układ całej aplikacji – osobny projekt, po pozostałych testach (playwright.config.ts).
test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });

const AT = encodeURIComponent('2026-11-12T11:00:00+01:00');

test('układ ekranu: podgląd przed zapisem, po zapisie zmienia się kiosk', async ({ page }) => {
	await page.goto('/admin');
	await expect(page.getByRole('link', { name: 'Układ ekranu' })).toBeVisible();
	await page.getByRole('link', { name: 'Układ ekranu' }).click();
	const sec = page.locator('#uklad');
	await expect(sec.getByRole('heading', { name: 'Układ ekranu' })).toBeVisible();

	// Wybór bez zapisu zmienia tylko podgląd.
	await sec.locator('[data-preset="month"]').click();
	const preview = sec.locator('iframe');
	await expect(preview).toHaveAttribute('src', /layout=month/);
	await expect(preview.contentFrame().locator('main[data-layout="month"]')).toBeVisible();
	await page.goto(`/?at=${AT}`);
	await expect(page.locator('main[data-layout="today-week"]')).toBeVisible();

	// Zapis: miesiąc, zwarta gęstość, obrót 90° (tylko informacja dla instalacji).
	await page.goto('/admin/uklad');
	await sec.locator('[data-preset="month"]').click();
	await sec.getByLabel('Zwarta').check();
	await sec.getByLabel('90°', { exact: true }).check();
	await expect(sec.locator('.cmd')).toHaveText('wlr-randr --output HDMI-A-1 --transform 90');
	await sec.getByRole('button', { name: 'Zapisz układ' }).click();
	await expect(sec.locator('.ok')).toBeVisible();

	await page.goto(`/?at=${AT}`);
	await expect(page.locator('main[data-layout="month"].compact')).toBeVisible();
	expect((await (await page.request.get('/api/display')).json()).rotation).toBe(90);

	// Pionowy z rozdzielczością 1080×1920: podgląd na przeglądzie panelu ma proporcje ekranu.
	await page.goto('/admin/uklad');
	await sec.locator('[data-preset="portrait"]').click();
	await sec.locator('select[name=resolution]').selectOption('1080x1920');
	await sec.getByRole('button', { name: 'Zapisz układ' }).click();
	await expect(sec.locator('.ok')).toBeVisible();
	await page.goto('/admin');
	const box = (await page.locator('#podglad .preview').boundingBox())!;
	expect(box.height).toBeGreaterThan(box.width);
	await expect(page.locator('#podglad iframe').contentFrame().locator('main[data-layout="portrait"]')).toBeVisible();

	// Powrót do domyślnego.
	await page.goto('/admin/uklad');
	await sec.locator('[data-preset="today-week"]').click();
	await sec.locator('select[name=resolution]').selectOption('auto');
	await sec.getByLabel('Wygodna').check();
	await sec.getByLabel('0°', { exact: true }).check();
	await sec.getByRole('button', { name: 'Zapisz układ' }).click();
	await expect(sec.locator('.ok')).toBeVisible();
	await page.goto(`/?at=${AT}`);
	await expect(page.locator('main[data-layout="today-week"]:not(.compact)')).toBeVisible();
});
