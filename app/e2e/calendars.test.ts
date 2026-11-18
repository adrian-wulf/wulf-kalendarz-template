import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Kalendarze (warstwy): subskrypcja iCal z atrapy serwera (e2e/ical-mock.mjs), ukrycie na kiosku do północy,
 * przełącznik w panelu, import pliku .ics z podglądem i bez duplikatów. Każdy test sprząta po sobie.
 */
const ICAL = `http://localhost:${Number(process.env.E2E_PORT ?? 4173) + 40}`;
const ADMIN = { 'tailscale-user-login': 'admin@test.local' };

const day = (n: number) => {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10).replaceAll('-', '');
};

test('subskrypcja iCal: błędny link z wyjaśnieniem, dodanie, widać na kiosku, ukrycie na kiosku i w panelu', async ({ browser, page }) => {
	const admin = await browser.newContext({ extraHTTPHeaders: ADMIN, viewport: { width: 1440, height: 1600 } });
	const a = await admin.newPage();
	await a.goto('/admin/kalendarze');
	await expect(a.getByRole('heading', { name: 'Kalendarze', level: 2 })).toBeVisible();
	// Instrukcja przy formularzu.
	await a.locator('[data-guide=subscribe] summary').click();
	await a.getByRole('tab', { name: 'Outlook.com' }).click();
	await expect(a.locator('[data-guide=subscribe] ol')).toContainText('Publikuj');

	const form = a.getByTestId('add-subscription');
	await form.locator('input[name=url]').fill(`${ICAL}/strona`);
	await form.locator('input[name=name]').fill('Klub E2E');
	await form.getByRole('button', { name: 'Sprawdź link i dodaj' }).click();
	await expect(a.locator('#subskrypcja .err')).toContainText('adres strony internetowej');

	await form.locator('input[name=url]').fill(`${ICAL}/przekierowanie.ics`);
	await form.locator('input[name=name]').fill('Klub E2E');
	await form.getByRole('button', { name: 'Sprawdź link i dodaj' }).click();
	await expect(a.locator('#subskrypcja .ok')).toBeVisible();
	const row = a.locator('article.layer', { hasText: 'Klub E2E' });
	await expect(row).toContainText('pobrane');

	// Kiosk: wydarzenia z subskrypcji, potem ukrycie do północy przyciskiem „Kalendarze”.
	await page.goto('/');
	const pill = page.locator('.week .pill', { hasText: 'E2E Mecz' });
	await expect(pill).toBeVisible();
	await page.getByTestId('layers-button').click();
	const sheet = page.getByTestId('layers-sheet');
	await sheet.locator('.layer', { hasText: 'Klub E2E' }).click();
	await expect(sheet.locator('.layer', { hasText: 'Klub E2E' })).toContainText('Ukryty do północy');
	await page.getByRole('button', { name: /Zamknij/ }).click();
	await expect(pill).toBeHidden();
	await expect(page.getByTestId('layers-button').locator('.badge')).toHaveText('1');
	await page.reload();
	await expect(page.locator('.week .pill', { hasText: 'E2E Mecz' })).toBeHidden();
	await page.getByTestId('layers-button').click();
	await page.getByRole('button', { name: 'Pokaż wszystkie' }).click();
	await page.getByRole('button', { name: /Zamknij/ }).click();
	await expect(pill).toBeVisible();

	// Panel: wyłączenie na kiosku na stałe – znika z kiosku i z listy przełączników kiosku.
	await a.reload();
	await row.locator('button[data-surface=kiosk]').click();
	await expect(row.locator('button[data-surface=kiosk]')).toHaveAttribute('aria-checked', 'false');
	await page.reload();
	await expect(page.locator('.week .pill', { hasText: 'E2E Mecz' })).toBeHidden();
	await page.getByTestId('layers-button').click();
	await expect(page.getByTestId('layers-sheet').locator('.layer', { hasText: 'Klub E2E' })).toHaveCount(0);
	await expect(page.getByTestId('layers-sheet')).toContainText('ukryty na stałe');

	// Sprzątanie: usunięcie subskrypcji.
	a.on('dialog', (d) => d.accept());
	await row.locator('details.edit summary').click();
	await row.getByRole('button', { name: 'Usuń kalendarz' }).click();
	await expect(a.locator('article.layer', { hasText: 'Klub E2E' })).toHaveCount(0);
	await admin.close();
});

test('import pliku .ics: podgląd, import do nowego kalendarza, drugi raz bez duplikatów', async ({ browser, page }) => {
	const dir = mkdtempSync(join(tmpdir(), 'ics-'));
	const file = join(dir, 'szkola.ics');
	writeFileSync(
		file,
		[
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'X-WR-CALNAME:Szkoła E2E',
			'BEGIN:VEVENT',
			'UID:imp-1',
			`DTSTART;VALUE=DATE:${day(4)}`,
			'SUMMARY:E2E Wycieczka',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'UID:imp-2',
			`DTSTART:${day(5)}T150000Z`,
			`DTEND:${day(5)}T160000Z`,
			'SUMMARY:E2E Zebranie',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'UID:imp-old',
			'DTSTART;VALUE=DATE:20200101',
			'SUMMARY:Dawno',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n')
	);
	const admin = await browser.newContext({ extraHTTPHeaders: ADMIN, viewport: { width: 1440, height: 1600 } });
	const a = await admin.newPage();
	await a.goto('/admin/kalendarze');
	await a.getByTestId('import-file').locator('input[type=file]').setInputFiles(file);
	await a.getByRole('button', { name: 'Sprawdź plik' }).click();
	const preview = a.getByTestId('import-preview');
	await expect(preview).toContainText('2 wydarzenia');
	await expect(preview).toContainText('Pominięte: 1 minione');
	await expect(preview.locator('input[name=name]')).toHaveValue('Szkoła E2E');
	await preview.getByRole('button', { name: 'Importuj 2 wydarzenia' }).click();
	await expect(a.getByTestId('import-done')).toContainText('2 nowych, 0 zaktualizowanych');
	await expect(a.locator('article.layer', { hasText: 'Szkoła E2E' })).toContainText('2 wydarzenia');

	// Drugi raz ten sam plik do tego samego kalendarza – aktualizacja, nie duplikat.
	await a.getByTestId('import-file').locator('input[type=file]').setInputFiles(file);
	await a.getByRole('button', { name: 'Sprawdź plik' }).click();
	await a.getByTestId('import-preview').locator('select[name=target]').selectOption({ label: 'Szkoła E2E' });
	await expect(a.getByTestId('import-preview')).toContainText('już tam są');
	await a.getByTestId('import-preview').getByRole('button', { name: 'Importuj 2 wydarzenia' }).click();
	await expect(a.getByTestId('import-done')).toContainText('0 nowych, 2 zaktualizowanych');
	await a.reload();
	await expect(a.locator('article.layer', { hasText: 'Szkoła E2E' })).toContainText('2 wydarzenia');

	await page.goto('/');
	await expect(page.locator('.week .pill', { hasText: 'E2E Wycieczka' })).toBeVisible();

	// Telefon: własny wybór kalendarzy.
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	const p = await phone.newPage();
	await p.goto('/telefon/kalendarz');
	await p.locator('.pick .chip').first().click();
	await expect(p.locator('.ev', { hasText: 'E2E Wycieczka' })).toBeVisible();
	await p.locator('details.fold summary').first().click();
	await p.getByTestId('phone-layers').locator('.layer', { hasText: 'Szkoła E2E' }).click();
	await expect(p.locator('.ev', { hasText: 'E2E Wycieczka' })).toBeHidden();
	await p.reload();
	await expect(p.locator('.ev', { hasText: 'E2E Wycieczka' })).toBeHidden();
	await phone.close();

	// Sprzątanie.
	a.on('dialog', (d) => d.accept());
	const row = a.locator('article.layer', { hasText: 'Szkoła E2E' });
	await row.locator('details.edit summary').click();
	await row.getByRole('button', { name: 'Usuń kalendarz' }).click();
	await expect(a.locator('article.layer', { hasText: 'Szkoła E2E' })).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.week .pill', { hasText: 'E2E Wycieczka' })).toBeHidden();
	await admin.close();
});
