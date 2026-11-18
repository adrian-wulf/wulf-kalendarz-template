import { expect, test } from '@playwright/test';
import { ADMIN, setModule } from './p3c';

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
	const page = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(page, 'care', false);
	await page.close();
});

test('opieka: przykłady w oknie, odhaczenie dotykiem i cofnięcie, nowa pozycja z panelu', async ({ browser }) => {
	const admin = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(admin, 'care', true);

	const kiosk = await browser.newPage();
	await kiosk.goto('/');
	const tile = kiosk.locator('[data-tile=care]');
	await expect(tile).toContainText('Monstera'); // przykład: w oknie 7–10 dni
	await expect(tile).not.toContainText('Filtr do wody'); // jeszcze nie
	await tile.getByRole('button', { name: 'Zrobione: Monstera' }).click();
	await expect(tile.getByRole('button', { name: 'Zrobione: Monstera' })).toHaveCount(0);
	await tile.locator('.undo').getByRole('button', { name: /Cofnij/ }).click();
	await expect(tile.getByRole('button', { name: 'Zrobione: Monstera' })).toBeVisible();

	await admin.goto('/admin/opieka');
	const form = admin.locator('#opieka form.new');
	await form.locator('[name=name]').fill('Kaktus');
	await form.locator('[name=icon]').fill('🌵');
	await form.locator('[name=minDays]').fill('14');
	await form.locator('[name=maxDays]').fill('21');
	await form.locator('[name=lastDone]').fill('');
	await form.getByRole('button', { name: /Dodaj/ }).click();
	await expect(admin.locator('#opieka details summary').first()).toContainText('jeszcze nie było'); // nowa pozycja na górze listy

	await kiosk.reload();
	await expect(tile).toContainText('Kaktus');
	await expect(tile).toContainText('jeszcze nie było');

	const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
	await phone.goto('/telefon/opieka');
	await phone.locator('.item', { hasText: 'Kaktus' }).getByRole('button', { name: 'Zrobione: Kaktus' }).click();
	await expect(phone.locator('.toast, [role=status]').first()).toContainText('Kaktus');
	await kiosk.reload();
	await expect(tile).not.toContainText('Kaktus');
	await admin.close();
	await kiosk.close();
	await phone.close();
});
