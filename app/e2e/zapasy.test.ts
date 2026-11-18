import { expect, test } from '@playwright/test';

test('zapasy na kiosku: nowy produkt, szybkie +1, koniec → zakupy', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Zapasy' }).click();
	await expect(page.getByRole('heading', { name: '📦 Zapasy' })).toBeVisible();

	await page.getByRole('button', { name: /Dodaj do: Spiżarnia/ }).click();
	for (const ch of 'kasza') await page.locator('.kb .key', { hasText: new RegExp(`^${ch}$`, 'i') }).first().dispatchEvent('pointerdown');
	await page.getByRole('button', { name: /Dalej/ }).click();
	await expect(page.locator('.chip.on', { hasText: 'Makarony, kasze, mąka' })).toBeVisible(); // zgadnięta kategoria
	await page.getByRole('button', { name: /✓ Dodaj 1 × Kasza/ }).click();

	const row = page.locator('.item', { hasText: 'Kasza' });
	await expect(row).toContainText('1');
	await page.locator('aside .chip', { hasText: 'Kasza' }).click(); // często dodawane: +1
	await expect(row.locator('.qty b')).toHaveText('2');

	await row.getByRole('button', { name: 'mniej' }).click();
	await row.getByRole('button', { name: 'mniej' }).click();
	await expect(page.locator('.toast')).toContainText('Kasza – dodane do listy zakupów');
	await expect(page.locator('.out', { hasText: 'Kasza' })).toBeVisible(); // „skończyło się”

	await page.getByRole('link', { name: '📅 Kalendarz' }).click();
	await expect(page.locator('.tile', { hasText: 'Zakupy' })).toContainText('Kasza');
});

test('zapasy na telefonie: dodanie do zamrażarki', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/telefon/zapasy');
	await page.locator('.pick .chip').first().click();
	await page.getByRole('button', { name: /Zamrażarka/ }).click();
	await page.getByRole('button', { name: /Dodaj do: Zamrażarka/ }).click();
	await page.getByPlaceholder(/Co dodajesz/).fill('Pierogi ruskie');
	await expect(page.locator('.line')).toContainText('Gotowe dania'); // zgadnięta kategoria, zwinięta
	await page.getByRole('button', { name: '5', exact: true }).click();
	await page.getByRole('button', { name: /✓ Dodaj 5 × Pierogi ruskie/ }).click();
	// Lista najpierw, kategorie zwinięte – rozwijamy „Gotowe dania”.
	await page.locator('summary', { hasText: 'Gotowe dania' }).click();
	const row = page.locator('.item', { hasText: 'Pierogi ruskie' });
	await expect(row).toContainText('od dziś');
	await expect(row.locator('.q b')).toHaveText('5');
});
