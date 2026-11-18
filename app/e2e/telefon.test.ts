import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('telefon: wybór osoby, kartka, zadanie i odhaczenie', async ({ page }) => {
	await page.goto('/telefon');
	await expect(page).toHaveURL(/\/telefon\/kalendarz/);
	await page.getByRole('link', { name: /Kartki/ }).click();
	await page.locator('.pick .chip', { hasText: 'Mama' }).click();
	await expect(page.locator('header .who')).toContainText('Mama');

	await page.getByRole('button', { name: 'Nowa kartka' }).click();
	await page.getByPlaceholder('Napisz kartkę…').fill('Kartka z telefonu');
	await page.getByRole('button', { name: 'Do jutra rana' }).click();
	await page.getByRole('button', { name: /Powieś kartkę/ }).click();
	const note = page.locator('.note', { hasText: 'Kartka z telefonu' });
	await expect(note).toContainText('Mama');

	await page.getByRole('link', { name: /Zadania/ }).click();
	await page.getByRole('button', { name: 'Nowe zadanie' }).click();
	await page.getByPlaceholder('Co trzeba zrobić?').fill('Podlać kwiaty');
	await page.getByRole('button', { name: /Dodaj zadanie/ }).click();
	const task = page.locator('.task', { hasText: 'Podlać kwiaty' });
	await expect(task).toContainText('Mama');
	await task.click();
	await expect(task).toBeHidden();
	await page.getByRole('button', { name: 'Cofnij' }).click();
	await expect(task).toBeVisible();

	// Kartka i zadanie widać też na kiosku.
	await page.goto('/');
	await expect(page.getByText('Kartka z telefonu')).toBeVisible();
	await expect(page.getByText('Podlać kwiaty')).toBeVisible();
});

test('telefon: Tailscale podaje osobę – bez pytania', async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'tailscale-user-login': 'nieznany@example.com' } });
	const page = await ctx.newPage();
	await page.goto('/telefon/weze');
	await expect(page.locator('.snake').first()).toBeVisible();
	// Nieznany login → pytamy, kim jest.
	await expect(page.locator('.pick')).toBeVisible();
	await ctx.close();
});
