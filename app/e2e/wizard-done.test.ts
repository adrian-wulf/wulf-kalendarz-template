import { expect, test } from '@playwright/test';

// Serwer główny (SKIP_SETUP, są domownicy): kreator uznany za zrobiony.
test('istniejąca instalacja: kiosk bez kreatora, /setup to 404', async ({ page, request }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('.week')).toBeVisible();
	expect((await request.get('/setup')).status()).toBe(404);
	expect((await request.get('/setup/miejsca?q=Berlin')).status()).toBe(404);
});
