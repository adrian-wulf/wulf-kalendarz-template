import { expect, test } from '@playwright/test';
import { ADMIN, MOCK, setModule } from './p3c';

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
	const page = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(page, 'homeassistant', false);
	await page.close();
});

test('Home Assistant: token tylko na serwerze, kafelki, przełączenie światła, kamera przez proxy', async ({ browser, request }) => {
	const admin = await browser.newPage({ extraHTTPHeaders: ADMIN });
	await setModule(admin, 'homeassistant', true);
	await admin.goto('/admin/home-assistant');
	await admin.locator('[name=url]').fill(MOCK);
	await admin.locator('[name=token]').fill('zly-token');
	await admin.getByRole('button', { name: 'Zapisz', exact: true }).click();
	await expect(admin.locator('#home-assistant .err')).toContainText('odrzucił token');

	await admin.locator('[name=token]').fill('e2e-ha-token');
	await admin.getByRole('button', { name: 'Zapisz', exact: true }).click();
	await admin.reload();
	await expect(admin.locator('[name=token]')).toHaveAttribute('placeholder', /…oken/);
	expect(await admin.content()).not.toContain('e2e-ha-token');
	for (const id of ['sensor.salon_temperatura', 'light.kuchnia', 'lock.drzwi', 'camera.wejscie']) await admin.locator(`input[value="${id}"]`).check();
	await admin.locator('[name="label:light.kuchnia"]').fill('Światło kuchnia');
	await admin.getByRole('button', { name: 'Zapisz wybór' }).click();
	await expect(admin.locator(`input[value="light.kuchnia"]`)).toBeChecked();

	const kiosk = await browser.newPage();
	await kiosk.goto('/');
	const tile = kiosk.locator('[data-tile=ha]');
	await expect(tile).toContainText('21,4 °C');
	await expect(tile).toContainText('zamknięte');
	expect(await kiosk.content()).not.toContain('e2e-ha-token');
	const light = tile.getByRole('button', { name: /Światło kuchnia/ });
	await expect(light).toHaveAttribute('aria-pressed', 'false');
	await Promise.all([kiosk.waitForResponse('**/api/homeassistant/toggle'), light.click()]);
	await expect(light).toHaveAttribute('aria-pressed', 'true');
	await kiosk.reload();
	await expect(tile.getByRole('button', { name: /Światło kuchnia/ })).toHaveAttribute('aria-pressed', 'true');
	// Zamek: tylko stan, bez przycisku; API też odmawia.
	await expect(tile.getByRole('button', { name: /Drzwi/ })).toHaveCount(0);
	expect((await request.post('/api/homeassistant/toggle', { data: { entityId: 'lock.drzwi' } })).status()).toBe(400);
	expect((await request.post('/api/homeassistant/toggle', { data: { entityId: 'switch.choinka' } })).status()).toBe(400); // nie wybrana

	const img = tile.locator('.cam img');
	await expect(img).toHaveAttribute('src', /\/api\/homeassistant\/camera\/camera\.wejscie/);
	await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320);
	const cam = await request.get('/api/homeassistant/camera/camera.wejscie');
	expect(cam.headers()['content-type']).toBe('image/png');
	expect((await request.get('/api/homeassistant/camera/light.kuchnia')).status()).toBe(404);
	await admin.close();
	await kiosk.close();
});
