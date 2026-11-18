import { expect, test, type Locator, type Page } from '@playwright/test';

async function type(page: Page, text: string) {
	for (const ch of text) {
		const key = ch === ' ' ? 'spacja' : ch.toLowerCase();
		await page.locator('.kb .key', { hasText: new RegExp(`^${key}$`, 'i') }).first().dispatchEvent('pointerdown');
	}
}

async function holdDown(el: Locator, ms: number) {
	const box = (await el.boundingBox())!;
	const page = el.page();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(ms);
	await page.mouse.up();
}

test('dodanie wydarzenia z kiosku', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: '+ Dodaj' }).click();
	await page.locator('.grid .tile', { hasText: 'Babcia' }).click();
	await type(page, 'Fryzjer');
	await expect(page.locator('.field')).toContainText('Fryzjer');
	await page.locator('.kb .enter').dispatchEvent('pointerdown');
	await page.locator('.day', { hasText: 'Jutro' }).click();
	await page.locator('.chip.hour', { hasText: /^10$/ }).click();
	await page.locator('.chip', { hasText: '10:30' }).click();
	await expect(page.locator('.preview')).toContainText('Babcia · Fryzjer');
	await page.getByRole('button', { name: '✓ Zapisz' }).click();
	await expect(page.getByText('Zapisane')).toBeVisible();
	await expect(page.locator('.week .pill', { hasText: 'Fryzjer' })).toBeVisible({ timeout: 5000 });
	await expect(page.locator('.week .pill', { hasText: 'Fryzjer' })).toContainText('10:30');
});

test('zakupy: dodanie z podpowiedzi, odhaczenie przytrzymaniem i cofnięcie', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tile', { hasText: 'Zakupy' }).getByRole('button', { name: '+' }).click();
	await type(page, 'pomi');
	await page.locator('.chip', { hasText: 'Pomidory' }).click();
	await expect(page.getByText('✓ Dodano: Pomidory')).toBeVisible();
	await page.locator('.kb .enter').dispatchEvent('pointerdown');
	const item = page.locator('.shopping li', { hasText: 'Pomidory' });
	await expect(item).toBeVisible();

	// Krótki dotyk nic nie usuwa – otwiera pełną listę
	await holdDown(item, 100);
	await expect(page.getByRole('heading', { name: /🛒 Zakupy · \d+/ })).toBeVisible();
	await page.getByRole('button', { name: '✕ Zamknij' }).click();
	await expect(item).toBeVisible();

	// Przytrzymanie usuwa, Cofnij przywraca
	await holdDown(item, 1700);
	await expect(item).toBeHidden();
	await page.getByRole('button', { name: '↶ Cofnij' }).click();
	await expect(item).toBeVisible();

	// Przytrzymanie bez cofania – po 5 s zapis na serwerze
	await holdDown(item, 1700);
	await page.waitForTimeout(5600);
	await page.reload();
	await expect(page.locator('.shopping li', { hasText: 'Pomidory' })).toHaveCount(0);
});

test('podgląd dnia i nawigacja tygodniami', async ({ page }) => {
	await page.goto('/');
	await page.locator('.week .head').first().click();
	await expect(page.getByRole('button', { name: '✕ Anuluj' })).toBeVisible();
	await page.getByRole('button', { name: '✕ Anuluj' }).click();
	const first = await page.locator('.week .num').first().textContent();
	await page.getByRole('button', { name: 'Następny tydzień' }).click();
	await expect(page.locator('.week .num').first()).not.toHaveText(first!);
	await page.getByRole('button', { name: 'Dziś' }).click();
	await expect(page.locator('.week .num').first()).toHaveText(first!);
});

test('kartka z kiosku', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tile', { hasText: 'Kartki' }).getByRole('button', { name: '+' }).click();
	await page.locator('.grid .tile', { hasText: 'Tata' }).click();
	await page.locator('.chip', { hasText: 'Wrócę późno' }).click();
	await page.locator('.kb .enter').dispatchEvent('pointerdown');
	await page.locator('.chip', { hasText: '3 dni' }).click();
	await page.getByRole('button', { name: '✓ Zapisz' }).click();
	await expect(page.locator('.note', { hasText: 'Wrócę późno' })).toBeVisible({ timeout: 5000 });
});

test('węże: karmienie z kiosku zdejmuje karmówkę, cofnięcie ją oddaje', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Węże' }).click();
	await expect(page.getByRole('heading', { name: '🐍 Węże' })).toBeVisible();
	const stock = page.locator('.stock', { hasText: '50 g+' }).locator('b');
	const before = Number(await stock.textContent());

	await page.locator('.card', { hasText: 'Rumba' }).click();
	await page.locator('.chip', { hasText: '50 g+' }).click();
	await page.getByRole('button', { name: /Nakarmiony · 50 g\+/ }).click();
	await expect(page.locator('.toast')).toContainText('Rumba: karmienie (50 g+)');
	await expect(page.locator('.card', { hasText: 'Rumba' })).toContainText('dziś');
	await expect(stock).toHaveText(String(before - 1));

	await page.getByRole('button', { name: '↶ Cofnij' }).click();
	await expect(stock).toHaveText(String(before));
	await expect(page.locator('.card', { hasText: 'Rumba' })).not.toContainText('🍽 dziś');

	await page.getByRole('link', { name: '📅 Kalendarz' }).click();
	await expect(page.getByRole('link', { name: 'Węże' })).toBeVisible();
});

test('pełna lista z kafelka: dodawanie, odhaczanie, przewijanie', async ({ page }) => {
	await page.goto('/');
	await page.locator('.tile', { hasText: 'Zadania' }).locator('h3').click();
	await expect(page.getByRole('heading', { name: /✅ Zadania ·/ })).toBeVisible();
	await page.getByRole('button', { name: '+ Nowe zadanie' }).click();
	await type(page, 'Umyc okna');
	await page.locator('.kb .enter').dispatchEvent('pointerdown');
	await page.locator('.grid .tile').first().click();
	await page.getByRole('button', { name: '✓ Zapisz' }).click();
	// po zapisie wraca do listy
	const row = page.locator('.scroll li', { hasText: 'Umyc okna' });
	await expect(row).toBeVisible({ timeout: 5000 });
	await row.getByRole('button', { name: '✓ Zrobione' }).click();
	await expect(row).toBeHidden();
	await page.getByRole('button', { name: '↶ Cofnij' }).click();
	await expect(row).toBeVisible();

	// zakupy: dużo pozycji – lista się przewija
	await page.getByRole('button', { name: '✕ Zamknij' }).click();
	for (const c of 'abcdefghijklmnoprs') await page.request.post('/api/shopping', { data: { name: `zz ${c}` } });
	await page.reload();
	await page.locator('.tile', { hasText: 'Zakupy' }).locator('h3').click();
	const scroll = page.locator('.scroll');
	await expect(scroll.locator('li', { hasText: 'zz s' })).toBeAttached();
	expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	await scroll.locator('li', { hasText: 'zz s' }).scrollIntoViewIfNeeded();
	await expect(scroll.locator('li', { hasText: 'zz s' })).toBeInViewport();
});
