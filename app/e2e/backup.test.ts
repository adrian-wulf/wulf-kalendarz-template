import { expect, test, type Page } from '@playwright/test';

// Osobna instancja (BACKUP_PORT w playwright.config.ts) – przywracanie podmienia całą bazę.
// Atrapa WebDAV: e2e/webdav-mock.mjs na WEBDAV_PORT.
const WEBDAV = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 4173) + 21}/kopie/kalendarz/`;
const SHOTS = process.env.E2E_SHOTS;

test.describe.configure({ mode: 'serial' });

/**
 * Imiona domowników z panelu – z właściwości `value`, nie z atrybutu. Svelte po hydratacji zdejmuje
 * atrybut `value` z pól (w wolnej chwili przeglądarki), więc `input[value="…"]` raz pasował, a raz nie –
 * stąd dawniej losowe błędy tego testu przy pełnym obciążeniu.
 */
const memberNames = (page: Page) => page.locator('form.member:not(.new) input[name=name]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('bez logowania: sekcja, pobieranie i wgrywanie zamknięte', async ({ request }) => {
	expect((await request.get('/admin/kopie')).status()).toBe(403);
	expect((await request.get('/admin/backup')).status()).toBe(403);
	expect((await request.post('/admin/backup/upload', { data: 'x', headers: { 'content-type': 'application/octet-stream' } })).status()).toBe(403);
});

test.describe('jako administrator', () => {
	test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });

	test('kopia teraz → WebDAV i folder → przywrócenie z listy → dane wracają', async ({ page, request }) => {
		page.on('dialog', (d) => d.accept());

		// Dane, które mają przetrwać
		await page.goto('/admin/domownicy');
		const nm = page.locator('form.member.new');
		await nm.locator('input[name=name]').fill('Babcia Kopia');
		await nm.getByRole('button', { name: 'Dodaj osobę' }).click();
		await expect(page.locator('form.member:not(.new) input[name=name]').last()).toHaveValue('Babcia Kopia');

		await page.goto('/admin/kopie');
		await expect(page.getByRole('heading', { name: 'Kopie zapasowe', level: 2 })).toBeVisible();

		// Miejsce WebDAV (atrapa Nextclouda)
		// Bez kopii poza komputerem formularz „Dodaj miejsce” jest już otwarty (26b).
		if (!(await page.locator('details.add').evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('details.add summary').click();
		const add = page.locator('details.add form');
		await add.locator('select[name=kind]').selectOption('webdav');
		await add.locator('input[name=name]').fill('Nextcloud');
		await add.locator('input[name=url]').fill(WEBDAV);
		await add.locator('input[name=user]').fill('kalendarz');
		await add.locator('input[name=password]').fill('app-password-123');
		await add.locator('input[name=keep]').fill('5');
		await add.getByRole('button', { name: 'Dodaj' }).click();
		const dav = page.getByTestId('target-webdav');
		await expect(dav).toContainText('Nextcloud');
		// hasło nie wraca do przeglądarki
		expect(await page.content()).not.toContain('app-password-123');
		await dav.getByRole('button', { name: 'Sprawdź' }).click();
		await expect(page.locator('#kopie .ok')).toBeVisible();

		await page.getByRole('button', { name: 'Zrób kopię teraz' }).click();
		await expect(page.locator('#kopie .ok')).toContainText('Kopia zrobiona');
		await expect(dav.locator('.pill.good')).toBeVisible();
		await expect(page.getByTestId('target-local').locator('.pill.good')).toBeVisible();

		await dav.getByRole('button', { name: 'Pokaż kopie' }).click();
		await expect(dav.locator('table.files code')).toHaveText(/^kalendarz-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/);

		// Pobranie świeżej kopii
		const dl = await request.get('/admin/backup', { headers: { 'sec-fetch-site': 'same-origin' } });
		expect(dl.status()).toBe(200);
		expect([...(await dl.body()).subarray(0, 2)]).toEqual([0x1f, 0x8b]);

		if (SHOTS) await page.screenshot({ path: `${SHOTS}/backup-section.png`, fullPage: true });
		if (SHOTS) {
			await page.getByRole('heading', { name: 'Przywracanie' }).scrollIntoViewIfNeeded();
			await page.screenshot({ path: `${SHOTS}/backup-section-restore.png` });
		}

		// Zmiana danych po kopii
		await page.goto('/admin/domownicy');
		await expect.poll(() => memberNames(page)).toContain('Babcia Kopia');
		const index = (await memberNames(page)).indexOf('Babcia Kopia');
		await page.locator('form.member:not(.new)').nth(index).getByRole('button', { name: 'Usuń' }).click();
		await expect.poll(() => memberNames(page)).not.toContain('Babcia Kopia');

		// Przywrócenie z listy folderu lokalnego
		await page.goto('/admin/kopie');
		const local = page.getByTestId('target-local');
		await local.locator('details.list summary').click();
		await local.locator('table.files tr').first().getByRole('button', { name: 'Przywróć…' }).click();
		const pending = page.getByTestId('restore-pending');
		await expect(pending).toBeVisible();
		await expect(pending).toContainText('Przywrócenie zastąpi całą bazę i wszystkie zdjęcia');
		if (SHOTS) await pending.screenshot({ path: `${SHOTS}/backup-restore-confirm.png` });
		await pending.getByRole('button', { name: 'Przywróć tę kopię' }).click();
		await expect(page.locator('#kopie .ok')).toContainText('Przywrócono');
		await expect(page.locator('#kopie .ok')).toContainText('kalendarz-przed-przywroceniem-');
		// ustawienia kopii przetrwały przywrócenie
		await expect(page.getByTestId('target-webdav')).toContainText('Nextcloud');

		await page.goto('/admin/domownicy');
		await expect.poll(() => memberNames(page)).toContain('Babcia Kopia');
		// kiosk działa na przywróconej bazie
		expect((await request.get('/')).status()).toBe(200);
	});

	test('wgranie pliku kopii: sprawdzenie, podsumowanie, anulowanie; śmieci odrzucone', async ({ page, request }) => {
		const dl = await request.get('/admin/backup', { headers: { 'sec-fetch-site': 'same-origin' } });
		const archive = await dl.body();

		await page.goto('/admin/kopie');
		const up = page.getByTestId('restore-upload');
		await up.locator('input[type=file]').setInputFiles({ name: 'zly.tar.gz', mimeType: 'application/gzip', buffer: Buffer.from('to nie jest kopia') });
		await up.getByRole('button', { name: 'Sprawdź kopię' }).click();
		await expect(page.locator('#kopie .err')).toContainText('To nie jest plik kopii');

		await up.locator('input[type=file]').setInputFiles({ name: 'kopia.tar.gz', mimeType: 'application/gzip', buffer: archive });
		await up.getByRole('button', { name: 'Sprawdź kopię' }).click();
		const pending = page.getByTestId('restore-pending');
		await expect(pending).toBeVisible();
		await expect(pending).toContainText('kopia.tar.gz');
		await expect(pending).toContainText('domownicy:');
		await pending.getByRole('button', { name: 'Anuluj' }).click();
		await expect(pending).toHaveCount(0);
	});

	test('szyfrowanie: hasło zapisane → kopie .enc; przywrócenie bez hasła w formularzu', async ({ page }) => {
		page.on('dialog', (d) => d.accept());
		await page.goto('/admin/kopie');
		await page.locator('input[name=passphrase2]').fill('haslo-e2e-123');
		await page.locator('form[action="?/backupPassphrase"] input[name=passphrase]').fill('haslo-e2e-123');
		await page.getByRole('button', { name: 'Włącz szyfrowanie' }).click();
		await expect(page.getByRole('button', { name: 'Wyłącz szyfrowanie' })).toBeVisible();
		await page.getByRole('button', { name: 'Zrób kopię teraz' }).click();
		await expect(page.locator('#kopie .ok')).toContainText('Kopia zrobiona');
		const local = page.getByTestId('target-local');
		await local.locator('details.list summary').click();
		// nowa kopia jest zaszyfrowana (w tej samej sekundzie może być też kopia „przed przywróceniem”)
		const first = local.locator('table.files tr', { hasText: /^kalendarz-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz\.enc/ });
		await expect(first).toHaveCount(1);
		await first.getByRole('button', { name: 'Przywróć…' }).click();
		await expect(page.getByTestId('restore-pending')).toContainText('zaszyfrowana, hasło poprawne');
		await page.getByTestId('restore-pending').getByRole('button', { name: 'Anuluj' }).click();
		await page.getByRole('button', { name: 'Wyłącz szyfrowanie' }).click();
		await expect(page.getByRole('button', { name: 'Włącz szyfrowanie' })).toBeVisible();
	});
});
