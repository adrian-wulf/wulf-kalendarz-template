import { expect, test, type Page } from '@playwright/test';

/**
 * Tryb demo (DEMO=1, DEMO_LANG=pl – serwer DEMO_PORT w playwright.config.ts): rodzina z Poznania, wszystkie
 * moduły, atrapy pogody, odjazdów i Home Assistanta; integracje, kopie i dostęp tylko do podglądu.
 * Na końcu zwykła instalacja (SAMPLE_PORT): „Wczytaj dane przykładowe” w przeglądzie panelu.
 */
const ADMIN = { 'tailscale-user-login': 'admin@test.local' };
const SAMPLE = `http://localhost:${Number(process.env.E2E_PORT ?? 4173) + 31}`;

test.describe.configure({ mode: 'serial' });

/** Błędy w przeglądarce (np. zduplikowane klucze w listach) psują stronę – zbieramy je. */
function errors(page: Page) {
	const list: string[] = [];
	page.on('pageerror', (e) => list.push(e.message));
	page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
	return list;
}

test('kiosk: każdy kafelek ma dane, atrapy działają bez sieci', async ({ page }) => {
	const errs = errors(page);
	await page.goto('/');
	await expect(page.locator('main[data-layout]')).toBeVisible();
	const tile = (k: string) => page.locator(`[data-tile="${k}"]`);
	await expect(tile('shopping')).toContainText('Mleko');
	await expect(tile('note')).toContainText('paczkomatu');
	await expect(tile('meal')).toContainText('Krem z dyni');
	await expect(tile('kids')).toContainText('Zosia');
	await expect(tile('countdown')).toContainText('Urodziny Zosi');
	await expect(tile('meds')).toContainText('Lek na ciśnienie');
	await expect(tile('care')).toContainText('Monstera');
	await expect(tile('transit')).toContainText('Rondo Lipowe');
	await expect(tile('transit')).toContainText('Dworzec Główny');
	await expect(tile('ha')).toContainText('Salon');
	await expect(tile('ha')).toContainText('°C');
	// Pogoda z atrapy, tydzień pełen wydarzeń rodziny, urodziny Zosi za 3 dni.
	await expect(page.locator('.card.today')).toContainText('°');
	await expect(page.getByTestId('birthday-countdown')).toContainText('Zosi');
	await expect(page.locator('.week .pill').first()).toBeVisible();
	expect(await page.locator('.week .pill').count()).toBeGreaterThan(10);
	expect(errs).toEqual([]);
});

test('kiosk: PIN demo 1234 otwiera ustawienia ekranu', async ({ page }) => {
	await page.goto('/');
	const clock = page.getByTestId('clock');
	const box = (await clock.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(page.getByTestId('pinpad')).toBeVisible({ timeout: 5000 });
	await page.mouse.up();
	for (const d of '1234') await page.locator(`[data-testid=pinpad] [data-key="${d}"]`).click();
	await page.locator('[data-testid=pinpad] [data-key=ok]').click();
	await expect(page.getByTestId('pinpad')).toBeHidden();
	await expect(page.locator('.sheet')).toBeVisible();
});

test.describe('panel w demo', () => {
	test.use({ extraHTTPHeaders: ADMIN });

	test('baner demo; integracje, kopie i dostęp tylko do podglądu', async ({ page, request }) => {
		await page.goto('/admin');
		await expect(page.getByTestId('demo-banner')).toContainText('Tryb demo');
		// W demo nie ma „Wczytaj dane przykładowe” ani ponownego kreatora.
		await expect(page.getByTestId('load-sample')).toHaveCount(0);
		await expect(page.locator('#kreator')).toHaveCount(0);

		for (const section of ['google', 'home-assistant', 'kopie']) {
			await page.goto(`/admin/${section}`);
			await expect(page.getByTestId('demo-lock')).toContainText('tylko do podglądu');
			await expect(page.getByTestId('demo-lock').locator('.locked')).toHaveAttribute('inert', '');
		}
		await page.goto('/admin/dostep');
		await expect(page.getByTestId('demo-lock')).toContainText('1234');
		// Zakupy: zablokowane tylko Bring!, lokalna lista działa.
		await page.goto('/admin/zakupy');
		await expect(page.locator('#bring [data-testid=demo-lock]')).toBeVisible();
		await expect(page.locator('#zakupy')).toContainText('Mleko');

		// Serwer odrzuca zablokowane akcje i trasy także z pominięciem formularza.
		const origin = { origin: test.info().project.use.baseURL! };
		const post = (path: string, form: Record<string, string>) => request.post(path, { form, headers: origin });
		expect((await post('/admin/google?/saveGoogleClient', { clientId: 'x', clientSecret: 'y' })).status()).toBe(403);
		expect((await post('/admin/kopie?/backupSaveTarget', { kind: 'webdav', url: 'https://example.com/' })).status()).toBe(403);
		expect((await post('/admin/dostep?/savePin', { pin: '9999', repeat: '9999' })).status()).toBe(403);
		expect((await post('/admin?/restartSetup', {})).status()).toBe(403);
		expect((await request.get('/admin/google/start')).status()).toBe(403);
		expect((await request.post('/admin/backup/upload', { data: 'x', headers: { 'content-type': 'application/octet-stream', ...origin } })).status()).toBe(403);
	});

	test('zwykłe sekcje działają; posiłki bez błędów na telefonie i w panelu', async ({ page }) => {
		const errs = errors(page);
		await page.goto('/admin/posilki');
		await expect(page.locator('input[list="meal-recipes"]').first()).toHaveValue('Krem z dyni');
		await page.goto('/admin/domownicy');
		await expect.poll(() => page.locator('form.member:not(.new) input[name=name]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual([
			'Marek',
			'Kasia',
			'Zosia',
			'Kuba',
			'Babcia'
		]);
		await page.goto('/telefon/posilki');
		await expect(page.getByRole('heading', { name: 'Posiłki' })).toBeVisible();
		await expect(page.locator('body')).not.toContainText('Internal Error');
		expect(errs).toEqual([]);
	});
});

test('zwykła instalacja: „Wczytaj dane przykładowe” dopisuje rodzinę, nic nie usuwa', async ({ browser }) => {
	const ctx = await browser.newContext({ baseURL: SAMPLE, extraHTTPHeaders: ADMIN });
	const page = await ctx.newPage();
	page.on('dialog', (d) => d.accept());
	const names = () => page.locator('form.member:not(.new) input[name=name]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

	await page.goto('/admin/domownicy');
	const before = await names();
	expect(before).toContain('Tata');

	await page.goto('/admin');
	await expect(page.getByTestId('demo-banner')).toHaveCount(0);
	await page.getByTestId('load-sample').click();
	await expect(page.locator('#przyklad .ok')).toContainText('domownicy – 5');
	await expect(page.getByTestId('load-sample')).toHaveCount(0);

	await page.goto('/admin/domownicy');
	await expect.poll(names).toEqual([...before, 'Marek', 'Kasia', 'Zosia', 'Kuba', 'Babcia']);
	// Moduły włączone od początku pokazują przykład od razu (posiłki itp. – po włączeniu modułu).
	await page.goto('/');
	await expect(page.locator('[data-tile="note"]')).toContainText('paczkomatu');
	await expect(page.locator('[data-tile="shopping"]')).toContainText('Ręczniki papierowe');
	await ctx.close();
});
