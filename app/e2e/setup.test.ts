import { expect, test, type Page } from '@playwright/test';

/**
 * Kreator pierwszego uruchomienia na świeżej bazie (osobny serwer – patrz playwright.config.ts).
 * Kolejno: pierwsze uruchomienie z „pustym” startem, potem ponowne uruchomienie z panelu z przykładem.
 * SHOTS=katalog zapisuje zrzut każdego kroku.
 */
test.describe.configure({ mode: 'serial' });

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
	if (!SHOTS) return;
	await page.waitForTimeout(300); // przejścia (przełączniki, motyw)
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const title = (page: Page) => page.locator('h1');
const next = (page: Page) => page.getByTestId('next').click();

/** Pisanie klawiaturą ekranową (jak na kiosku). */
async function tap(page: Page, text: string) {
	for (const ch of text) {
		const key = ch === ' ' ? 'spacja' : ch.toLowerCase();
		await page.locator('.kb .key', { hasText: new RegExp(`^${key}$`, 'i') }).first().dispatchEvent('pointerdown');
	}
}

test('świeża instalacja: kiosk prowadzi do kreatora, „pusty” start', async ({ page, request }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);

	// a) Język
	await expect(title(page)).toHaveText('Wybierz język');
	await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
	await expect(page.getByTestId('back')).toHaveCount(0);
	await shot(page, '01-jezyk');
	// Zmiana języka od razu przełącza cały kreator (bez przechodzenia dalej).
	await page.getByTestId('lang-de').click();
	await expect(title(page)).toHaveText('Sprache wählen');
	await expect(page.getByTestId('lang-de')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('next')).toHaveText('Weiter');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await shot(page, '01-jezyk-de');
	await page.getByTestId('lang-en').click();
	await expect(title(page)).toHaveText('Choose a language');
	await expect(page.locator('.progress')).toContainText('Screen layout');
	await shot(page, '01-jezyk-en');
	await page.getByTestId('lang-pl').click();
	await expect(title(page)).toHaveText('Wybierz język');
	await expect(page.getByTestId('lang-pl')).toHaveAttribute('aria-pressed', 'true');
	await next(page);

	// b) Region
	await expect(title(page)).toHaveText('Gdzie mieszkacie?');
	await page.getByTestId('country-DE').click();
	await expect(page.getByRole('heading', { name: 'Land' })).toBeVisible();
	await page.getByTestId('country-PL').click();
	await expect(page.getByRole('heading', { name: 'Województwo' })).toBeVisible();
	// Po zmianie kraju trzeba wybrać województwo.
	await expect(page.getByTestId('next')).toBeDisabled();
	await page.getByRole('button', { name: 'małopolskie' }).click();
	await expect(page.getByTestId('timezone')).toHaveValue('Europe/Warsaw');
	await shot(page, '02-region');
	await next(page);

	// c) Miejscowość – wyszukiwanie przez serwer (atrapa Open-Meteo), wpisywanie klawiaturą ekranową
	await expect(title(page)).toHaveText('Miejscowość do pogody');
	await expect(page.getByTestId('next')).toBeDisabled();
	await page.getByTestId('place-query').dispatchEvent('pointerdown');
	await expect(page.getByTestId('keyboard')).toBeVisible();
	await tap(page, 'krak');
	await expect(page.getByTestId('place-query')).toHaveValue('Krak');
	await shot(page, '03a-klawiatura');
	await page.locator('.kb .enter').dispatchEvent('pointerdown');
	await expect(page.getByTestId('keyboard')).toBeHidden();
	await page.getByRole('button', { name: /^Kraków/ }).click();
	await expect(page.getByTestId('place-picked')).toContainText('Kraków');
	await shot(page, '03-miejscowosc');
	// Ręczne współrzędne (bez internetu) też przechodzą.
	await page.getByTestId('place-manual').click();
	await page.getByTestId('place-lat').fill('50,06');
	await page.getByTestId('place-lon').fill('19,94');
	await next(page);

	// d) Domownicy
	await expect(title(page)).toHaveText('Kto mieszka w domu?');
	await expect(page.getByTestId('next')).toBeDisabled();
	await page.getByTestId('member-name').first().fill('Ewa');
	await page.getByTestId('member-add').click();
	await page.getByTestId('member-name').nth(1).fill('Jan');
	await page.getByTestId('member-add').click();
	await page.getByTestId('member-name').nth(2).fill('Ewa');
	await page.getByRole('button', { name: 'Kolor: Jan' }).click();
	await expect(page.locator('.palette .swatch')).not.toHaveCount(0);
	await page.locator('.palette .swatch:not(.taken)').last().click();
	await next(page);
	await expect(page.getByRole('alert')).toContainText('„Ewa” się powtarza');
	await page.getByTestId('member-remove').nth(2).click();
	await shot(page, '04-domownicy');
	await next(page);

	// Restart w trakcie (np. zanik prądu) – wraca ten sam krok.
	await expect(title(page)).toHaveText('Co ma być na ekranie?');
	await page.reload();
	await expect(title(page)).toHaveText('Co ma być na ekranie?');

	// e) Moduły z zależnościami
	const mod = (id: string) => page.getByTestId(`module-${id}`);
	await expect(mod('pantry')).toHaveAttribute('aria-checked', 'true');
	await mod('shopping').click();
	await expect(mod('pantry')).toHaveAttribute('aria-checked', 'false');
	await expect(page.locator('.note')).toContainText('Wyłączono też: Zapasy');
	await mod('pantry').click();
	await expect(mod('shopping')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('.note')).toContainText('Włączono też: Zakupy');
	await mod('snakes').click();
	await expect(mod('snakes')).toHaveAttribute('aria-checked', 'false');
	await shot(page, '05-moduly');
	await next(page);

	// f) Motyw – podgląd na żywo
	await expect(title(page)).toHaveText('Wybierz motyw');
	await page.getByTestId('theme-fiord').click();
	await expect(page.locator('.setup')).toHaveCSS('background-color', 'rgb(217, 227, 232)');
	await shot(page, '06-motyw');
	await next(page);

	// g) Układ ekranu
	await expect(title(page)).toHaveText('Układ ekranu');
	await expect(page.getByTestId('layout-today-week')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('layout-month').click();
	await shot(page, '06b-uklad');
	await next(page);

	// g) Dane
	await expect(title(page)).toHaveText('Od czego zacząć?');
	await expect(page.getByTestId('next')).toBeDisabled();
	await page.getByTestId('demo-empty').click();
	await shot(page, '07-dane');
	await next(page);

	// h) Podsumowanie
	await expect(title(page)).toHaveText('Wszystko gotowe');
	await expect(page.locator('.sum')).toContainText('Polska, małopolskie');
	await expect(page.locator('.sum')).toContainText('Ewa');
	await expect(page.locator('.sum')).toContainText('wyłączone: Węże');
	await expect(page.locator('.sum')).toContainText('pusty start');
	await expect(page.locator('.sum')).toContainText('Miesiąc');
	await expect(page.getByTestId('admin-url')).toHaveText('https://kalendarz.test.ts.net/admin');
	await shot(page, '08-podsumowanie');
	await page.getByTestId('finish').click();

	await expect(page).toHaveURL(/\/$/);
	// Pusty start: bez przykładowych zakupów, kartek i wydarzeń.
	await expect(page.locator('[data-layout="month"]')).toBeVisible();
	await expect(page.getByText('Lista pusta')).toBeVisible();
	await expect(page.getByText('Brak kartek')).toBeVisible();
	await expect(page.getByText('Nic zaplanowanego')).toBeVisible();
	await expect(page.getByRole('button', { name: /Węże/ })).toHaveCount(0);
	expect((await request.get('/setup')).status()).toBe(404);
	expect((await request.get('/setup/miejsca?q=Krak')).status()).toBe(404);
});

test('ponowne uruchomienie z panelu: obecne wartości, „przykład”', async ({ page, browser }) => {
	await page.setExtraHTTPHeaders({ 'tailscale-user-login': 'admin@test.local' });
	await page.goto('/admin');
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Uruchom kreator ponownie' }).click();
	await expect(page).toHaveURL(/\/setup$/);
	await expect(title(page)).toHaveText('Wybierz język');

	// Kiosk też trafia do kreatora.
	const kiosk = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await kiosk.goto('/');
	await expect(kiosk).toHaveURL(/\/setup$/);
	await kiosk.close();

	// Wszystkie kroki dostępne z paska postępu, z obecnymi wartościami.
	await page.locator('.progress button', { hasText: 'Domownicy' }).click();
	await expect(title(page)).toHaveText('Kto mieszka w domu?');
	await expect(page.getByTestId('member-name')).toHaveCount(2);
	await expect(page.getByTestId('member-name').first()).toHaveValue('Ewa');

	await page.locator('.progress button', { hasText: 'Region' }).click();
	await expect(page.getByRole('button', { name: 'małopolskie' })).toHaveAttribute('aria-pressed', 'true');
	await page.locator('.progress button', { hasText: 'Moduły' }).click();
	await expect(page.getByTestId('module-snakes')).toHaveAttribute('aria-checked', 'false');
	await page.locator('.progress button', { hasText: 'Dane' }).click();
	await expect(page.getByTestId('demo-empty')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('demo-example').click();
	await next(page);
	await expect(page.locator('.sum')).toContainText('z przykładem');
	await page.getByTestId('finish').click();

	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('.shopping li', { hasText: 'Mleko' })).toBeVisible();
	expect((await page.request.get('/setup')).status()).toBe(404);
});

test('telefon: ten sam kreator na wąskim ekranie, zwykła klawiatura', async ({ browser, page }) => {
	await page.setExtraHTTPHeaders({ 'tailscale-user-login': 'admin@test.local' });
	await page.goto('/admin');
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Uruchom kreator ponownie' }).click();
	await expect(page).toHaveURL(/\/setup$/);

	const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
	await phone.goto('/setup');
	await expect(phone.locator('.compact')).toContainText('Krok 1 z 9');
	await shot(phone, '09-telefon-jezyk');
	// Ponowne uruchomienie – kroki mają obecne wartości, więc Dalej przechodzi od razu.
	for (const h of ['Gdzie mieszkacie?', 'Miejscowość do pogody', 'Kto mieszka w domu?']) {
		await next(phone);
		await expect(title(phone)).toHaveText(h);
	}
	await expect(phone.locator('.compact')).toContainText('Krok 4 z 9');
	expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	// Na telefonie zwykłe pole – bez klawiatury ekranowej.
	await phone.getByTestId('member-name').first().click();
	await expect(phone.getByTestId('keyboard')).toHaveCount(0);
	await shot(phone, '10-telefon-domownicy');
	for (const h of ['Co ma być na ekranie?', 'Wybierz motyw', 'Układ ekranu', 'Od czego zacząć?', 'Wszystko gotowe']) {
		await next(phone);
		await expect(title(phone)).toHaveText(h);
	}
	await shot(phone, '11-telefon-podsumowanie');
	await phone.getByTestId('finish').click();
	await expect(phone).toHaveURL(/\/$/);
	await phone.close();
});
