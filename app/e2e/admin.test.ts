import { expect, test } from '@playwright/test';

test('panel: bez Tailscale 403, obcy login 403', async ({ request }) => {
	expect((await request.get('/admin')).status()).toBe(403);
	expect((await request.get('/admin', { headers: { 'tailscale-user-login': 'obcy@example.com' } })).status()).toBe(403);
	expect((await request.get('/admin/backup')).status()).toBe(403);
	// Podstrony też – także sekcje modułów.
	expect((await request.get('/admin/weze')).status()).toBe(403);
	expect((await request.get('/admin/domownicy', { headers: { 'tailscale-user-login': 'obcy@example.com' } })).status()).toBe(403);
});

test.describe('jako administrator', () => {
	test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });

	test('dodanie domownika i zadania widać na kiosku', async ({ page }) => {
		await page.goto('/admin/domownicy');
		await expect(page.getByRole('heading', { name: 'Domownicy' })).toBeVisible();

		const nm = page.locator('form.member.new');
		await nm.locator('input[name=name]').fill('Dziadek');
		await nm.getByRole('button', { name: 'Dodaj osobę' }).click();
		const row = page.locator('form.member:not(.new)').last();
		await expect(row.locator('input[name=name]')).toHaveValue('Dziadek');

		// Kolor pojemnika jest odrzucany
		await row.locator('input[type=color]').fill('#f5c400');
		await row.getByRole('button', { name: 'Zapisz' }).click();
		await expect(page.locator('.toast.bad')).toContainText('zbyt podobny do koloru pojemnika');

		await page.goto('/admin/zadania');
		const nc = page.locator('#zadania form.new');
		await nc.locator('input[name=title]').fill('Podlać pomidory');
		await nc.locator('select[name=type]').selectOption('daily');
		await nc.getByRole('button', { name: 'Dodaj zadanie' }).click();
		await expect(page.locator('#zadania .row.item', { hasText: 'Podlać pomidory' })).toBeVisible();

		await page.goto('/');
		await expect(page.locator('.tasks li', { hasText: 'Podlać pomidory' })).toBeVisible();
	});

	test('zapasy: dodanie do zamrażarki z panelu widać na kiosku', async ({ page }) => {
		await page.goto('/admin/zapasy');
		const form = page.locator('form[action="?/addPantryItem"]').filter({ has: page.locator('input[value=zamrazarka]') });
		await form.locator('input[name=name]').fill('Gołąbki z panelu');
		await form.locator('input[name=qty]').fill('4');
		await form.getByRole('button', { name: 'Dodaj' }).click();
		await expect(page.locator('#zapasy form[action="?/saveItem"]', { hasText: 'Gołąbki z panelu' }).locator('input[name=qty]')).toHaveValue('4');

		await page.goto('/zapasy');
		await page.getByRole('button', { name: /Zamrażarka/ }).click();
		const row = page.locator('.item', { hasText: 'Gołąbki z panelu' });
		await expect(row.locator('.qty b')).toHaveText('4');
		await expect(page.locator('.group', { hasText: 'Gotowe dania' })).toContainText('Gołąbki z panelu');
	});

	test('region PL, zestaw pojemników PL i ręczny termin wywozu widać na kiosku', async ({ page }) => {
		page.on('dialog', (d) => d.accept());
		const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date(Date.now() + 86_400_000));

		await page.goto('/admin/region');
		const region = page.locator('form.region');
		await region.locator('select[name=country]').selectOption('PL');
		await expect(region.locator('select[name=timezone]')).toHaveValue('Europe/Warsaw');
		await region.locator('select[name=subdivision]').selectOption({ label: 'mazowieckie' });
		await region.getByRole('button', { name: 'Zapisz region' }).click();
		await expect(page.locator('#region .ok')).toBeVisible();
		await expect(region.locator('select[name=subdivision]')).toHaveValue('PL-MZ');

		// Bez własnych reguł zestaw idzie za krajem; „Wczytaj zestaw” zapisuje go jako własny.
		await page.goto('/admin/smieci');
		await expect(page.locator('#smieci form.rules input[name=label]').first()).toHaveValue('Metale i tworzywa');
		// Reguły pojemników są zwinięte („dla zaawansowanych”).
		await page.locator('#smieci details.advanced summary').click();
		await page.getByRole('button', { name: 'Wczytaj zestaw PL' }).click();
		await expect(page.locator('#smieci .ok', { hasText: 'Zapisano reguły' })).toBeVisible();

		const manual = page.locator('form.manual');
		await manual.locator('input[name=date]').fill(tomorrow);
		await manual.locator('select[name=bin]').selectOption({ label: 'Szkło' });
		await manual.getByRole('button', { name: 'Dodaj termin' }).click();
		await expect(page.locator(`#smieci [data-testid=waste-upcoming] .chip[data-date="${tomorrow}"]`, { hasText: 'Szkło' })).toBeVisible();

		await page.goto('/');
		await expect(page.locator('.tasks li', { hasText: 'Wystawić: Szkło' })).toBeVisible();

		// Przywrócenie DE, żeby nie wpływać na inne testy
		await page.goto('/admin/smieci');
		await page.locator('#smieci details.bin-list summary').first().click();
		await page.locator('#smieci form[action="?/deleteManualPickup"]').first().getByRole('button').click();
		await expect(page.locator('#smieci form[action="?/deleteManualPickup"]')).toHaveCount(0);
		await page.goto('/admin/region');
		await region.locator('select[name=country]').selectOption('DE');
		await region.locator('select[name=subdivision]').selectOption('DE-NI');
		await region.getByRole('button', { name: 'Zapisz region' }).click();
		await expect(page.locator('#region .ok')).toBeVisible();
		await page.goto('/admin/smieci');
		await page.locator('#smieci details.advanced summary').click();
		await page.getByRole('button', { name: 'Wczytaj zestaw DE' }).click();
		await expect(page.locator('#smieci form.rules input[name=label]').first()).toHaveValue('Gelbe Tonne');
	});

	test('wygląd: zmiana motywu widać na kiosku', async ({ page }) => {
		await page.goto('/admin/wyglad');
		const sec = page.locator('#wyglad');
		await sec.getByText('Noc', { exact: true }).click();
		await expect(sec.locator('input[name=day-bg]')).toHaveValue('#13171d');
		await sec.getByRole('button', { name: 'Zapisz wygląd' }).click();
		await expect(sec.locator('.ok')).toBeVisible();
		const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
		await page.goto(`/?at=${encodeURIComponent('2026-11-12T11:00:00+01:00')}`);
		expect(await bg()).toBe('#13171d');
		// Nieczytelny tekst jest odrzucany, przywrócenie wraca do Papieru po wyborze motywu.
		await page.goto('/admin/wyglad');
		await sec.locator('input[name=day-fg]').fill('#1c222a');
		await sec.getByRole('button', { name: 'Zapisz wygląd' }).click();
		await expect(sec.locator('.err')).toContainText('Za słaby kontrast');
		await sec.getByText('Papier', { exact: true }).click();
		await sec.getByRole('button', { name: 'Zapisz wygląd' }).click();
		await expect(sec.locator('.ok')).toBeVisible();
		await page.goto(`/?at=${encodeURIComponent('2026-11-12T11:00:00+01:00')}`);
		expect(await bg()).toBe('#f4efe6');
	});

	test('kopia do pobrania (archiwum .tar.gz)', async ({ request }) => {
		// obca strona (np. <img src>) – 403; link z panelu – archiwum
		expect((await request.get('/admin/backup', { headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403);
		const r = await request.get('/admin/backup', { headers: { 'sec-fetch-site': 'same-origin' } });
		expect(r.status()).toBe(200);
		expect(r.headers()['content-disposition']).toMatch(/kalendarz-.*\.tar\.gz/);
		expect([...(await r.body()).subarray(0, 2)]).toEqual([0x1f, 0x8b]);
	});
});
