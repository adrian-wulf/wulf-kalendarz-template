import { expect, test } from '@playwright/test';
import { ADMIN, setModule } from './p3c';

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
	const page = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(page, 'meds', false);
	await page.close();
});

test('leki: plan w panelu, „Wzięte” na kiosku z cofnięciem, telefon i historia', async ({ browser, request }) => {
	expect((await request.post('/api/meds/take', { data: { medId: 1, time: '08:00' } })).status()).toBe(404); // moduł wyłączony
	const admin = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(admin, 'meds', true);
	await admin.goto('/admin/leki');
	await expect(admin.locator('#leki .privacy')).toContainText('lokalnej bazie');
	const form = admin.locator('#leki form.new');
	await form.locator('[name=name]').fill('Witamina D');
	await form.locator('[name=dose]').fill('1 tabl.');
	await form.locator('[name=memberId]').selectOption({ index: 1 });
	// 00:01 – dziś zawsze już „do wzięcia” albo zaległa
	await form.locator('[name=times]').fill('00:01, 23:59');
	await form.getByRole('button', { name: /Dodaj lek/ }).click();
	await expect(admin.locator('#leki form:not(.new) [name=name]')).toHaveValue('Witamina D');

	const kiosk = await browser.newPage();
	await kiosk.goto('/');
	const tile = kiosk.locator('[data-tile=meds]');
	await expect(tile).toContainText('Witamina D');
	const dose = tile.locator('.dose', { hasText: '00:01' });
	await dose.getByRole('button', { name: /Wzięte/ }).click();
	await expect(dose).toHaveClass(/taken/);
	await expect(tile.locator('.undo')).toContainText('Witamina D');
	await tile.locator('.undo').getByRole('button', { name: /Cofnij/ }).click();
	await expect(dose.getByRole('button', { name: /Wzięte/ })).toBeVisible();
	await dose.getByRole('button', { name: /Wzięte/ }).click();
	await expect(dose).toHaveClass(/taken/);

	const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
	await phone.goto('/telefon/leki');
	// Zakładka może być w „Więcej” (z kalendarzem jest więcej zakładek) – tytuł strony mówi, gdzie jesteśmy.
	await expect(phone.locator('header h1')).toHaveText('Leki');
	await expect(phone.locator('.dose.taken')).toContainText('Witamina D');

	await admin.reload();
	await expect(admin.locator('#leki .hist')).toContainText('00:01, 23:59');
	await admin.close();
	await kiosk.close();
	await phone.close();
});
