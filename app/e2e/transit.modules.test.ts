import { expect, test } from '@playwright/test';
import { ADMIN, MOCK, saveConfig, setModule } from './p3c';

test.describe.configure({ mode: 'serial' });
test.use({ extraHTTPHeaders: ADMIN });

test.afterAll(async ({ browser }) => {
	const page = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(page, 'transit', false);
	await page.close();
});

test('odjazdy (HAFAS REST): wyszukanie przystanku w panelu, odjazdy z opóźnieniem na kiosku', async ({ page }) => {
	await setModule(page, 'transit', true);
	await page.goto('/admin/odjazdy');
	await saveConfig(page, { provider: 'custom', apiUrl: MOCK });
	await page.locator('#odjazdy [name=q]').fill('Hauptbahnhof');
	await page.locator('#odjazdy form.search button').click();
	await page.locator('#odjazdy .hits form', { hasText: 'S+U Berlin Hauptbahnhof' }).getByRole('button', { name: 'Wybierz' }).click();
	await expect(page.locator('#odjazdy .row.item').first()).toContainText('S+U Berlin Hauptbahnhof');
	await expect(page.locator('#odjazdy table.deps')).toContainText('U5');

	await page.goto('/');
	const tile = page.locator('[data-tile=transit]');
	await expect(tile).toContainText('S+U Berlin Hauptbahnhof');
	await expect(tile.locator('li')).toHaveCount(5);
	await expect(tile.locator('li', { hasText: 'U5' }).locator('.delay')).toHaveText('+2');
	await expect(tile.locator('li', { hasText: 'RE1' })).toContainText('odwołany');
	await expect(tile).not.toContainText('rozkład');
});

test('odjazdy (GTFS): plik z adresu, przystanek ze stacji, rozkład na kiosku', async ({ page }) => {
	await page.goto('/admin/odjazdy');
	await saveConfig(page, { provider: 'gtfs', gtfsUrl: `${MOCK}/gtfs.zip`, apiUrl: '' });
	await expect(page.locator('#odjazdy .row.item')).toHaveCount(0); // przystanek innego dostawcy nie obowiązuje
	await page.locator('#odjazdy [name=q]').fill('rondo przyklad');
	await page.locator('#odjazdy form.search button').click();
	await page.locator('#odjazdy .hits form', { hasText: 'stacja' }).getByRole('button', { name: 'Wybierz' }).click();
	await expect(page.locator('#odjazdy .row.item').first()).toContainText('Rondo Przykładowe');
	await expect(page.locator('#odjazdy')).toContainText('Plik GTFS');
	await expect(page.locator('#odjazdy table.deps')).toContainText('175');

	await page.goto('/');
	const tile = page.locator('[data-tile=transit]');
	await expect(tile).toContainText('Rondo Przykładowe');
	await expect(tile).toContainText('rozkład');
	await expect(tile.locator('li', { hasText: '175' }).first()).toContainText('Lotnisko');
});
