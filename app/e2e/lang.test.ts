import { expect, test, type Page } from '@playwright/test';

/**
 * Język interfejsu (ustawienie globalne – osobny projekt na końcu, patrz playwright.config.ts):
 * zmiana w panelu → kiosk po niemiecku i po angielsku, na koniec z powrotem polski.
 * SHOTS=katalog zapisuje zrzuty kiosku w każdym języku.
 */
test.describe.configure({ mode: 'serial' });

const AT = encodeURIComponent('2026-11-12T11:00:00+01:00');
const SHOTS = process.env.SHOTS;

async function setLanguage(page: Page, lang: 'pl' | 'de' | 'en') {
	await page.goto('/admin/ustawienia');
	await page.getByTestId('language').selectOption(lang);
	await page.locator('form[action="?/saveLanguage"] button').click();
	await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test.beforeEach(async ({ page }) => {
	await page.setExtraHTTPHeaders({ 'tailscale-user-login': 'admin@test.local' });
});

test.afterAll(async ({ browser }) => {
	const page = await browser.newPage({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });
	await setLanguage(page, 'pl');
	await page.close();
});

test('niemiecki: kiosk, telefon i panel', async ({ page }) => {
	await setLanguage(page, 'de');
	await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();

	await page.goto(`/?at=${AT}`);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.locator('.today .date')).toHaveText('Donnerstag, 12. November');
	await expect(page.locator('.week .wd').first()).toHaveText('Fr');
	await expect(page.locator('.week .wd')).toContainText(['Fr', 'Sa', 'So', 'Mo', 'Di', 'Mi', 'Do']);
	await expect(page.locator('[data-tile="shopping"] h3')).toContainText('Einkauf');
	await expect(page.locator('[data-tile="note"] h3')).toContainText('Zettel');
	await expect(page.locator('[data-tile="chore"] h3')).toContainText('Aufgaben');
	await expect(page.locator('.week .range, .week .nav').first()).toBeVisible();
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/kiosk-de.png` });

	// Klawiatura ekranowa: domyślnie układ niemiecki (QWERTZ z umlautami).
	await page.locator('[data-tile="shopping"] .add').click();
	await expect(page.locator('.kb .key', { hasText: /^Ü$/ })).toBeVisible();
	await expect(page.locator('.kb .lang')).toContainText('DE');
	await page.locator('.kb .lang').dispatchEvent('pointerdown');
	await expect(page.locator('.kb .lang')).toContainText('EN');

	await page.goto('/telefon/zadania');
	await expect(page.locator('nav')).toContainText('Aufgaben');
});

test('angielski: kiosk', async ({ page }) => {
	await setLanguage(page, 'en');
	await page.goto(`/?at=${AT}`);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('.today .date')).toHaveText('Thursday 12 November');
	await expect(page.locator('.week .wd').first()).toHaveText('Fri');
	await expect(page.locator('[data-tile="shopping"] h3')).toContainText('Shopping');
	await expect(page.locator('.today h2')).toHaveText('Today');
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/kiosk-en.png` });
	// Błąd API też po angielsku.
	const r = await page.request.post('/api/notes', { data: { text: '', duration: 'evening' } });
	expect(r.status()).toBe(400);
	expect((await r.json()).message).toMatch(/text/i);
});

test('z powrotem polski', async ({ page }) => {
	await setLanguage(page, 'pl');
	await page.goto(`/?at=${AT}`);
	await expect(page.locator('[data-tile="shopping"] h3')).toContainText('Zakupy');
	await expect(page.locator('.today .date')).toHaveText('Czwartek, 12 listopada');
});
