import { expect, test, type Page } from '@playwright/test';

/**
 * Ekran (plan i jasność), profile domowników (awatar, urodziny, imieniny) i wygaszacz.
 * Zmieniają stan globalny (plan ekranu, region, moduły) – działają w projekcie „modules”
 * (nazwa pliku pasuje do jego wzorca), po kolei, i przywracają ustawienia na końcu.
 */
test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });
test.describe.configure({ mode: 'serial' });

// Czwartek 12.11.2026, 9:30 w Berlinie – urodziny Kuby za 3 dni, imieniny Renaty i Witolda.
const AT = '2026-11-12T08:30:00Z';

/** Prawdziwy JPEG z płótna przeglądarki (przeglądarka panelu musi go odczytać i zmniejszyć). */
async function jpeg(page: Page, w: number, h: number, color: string): Promise<Buffer> {
	const url = await page.evaluate(
		([w, h, color]) => {
			const c = document.createElement('canvas');
			c.width = Number(w);
			c.height = Number(h);
			const x = c.getContext('2d')!;
			x.fillStyle = String(color);
			x.fillRect(0, 0, c.width, c.height);
			x.fillStyle = '#fff';
			x.fillRect(c.width / 3, c.height / 3, c.width / 3, c.height / 3);
			return c.toDataURL('image/jpeg', 0.9);
		},
		[w, h, color]
	);
	return Buffer.from(url.split(',')[1], 'base64');
}

async function setModule(page: Page, id: string, on: boolean) {
	await page.goto('/admin');
	const row = page.locator(`#moduly [data-module=${id}]`);
	await row.getByRole('button', { name: on ? 'Włącz' : 'Wyłącz' }).click();
	await expect(row.getByRole('button', { name: on ? 'Wyłącz' : 'Włącz' })).toBeVisible();
}

async function saveScreen(page: Page, week: [string, string, string], weekend?: [string, string, string], brightness?: { day: string; evening: string; night: string; wake: string }) {
	await page.goto('/admin/ekran');
	const f = page.locator('#ekran form');
	await f.locator('input[name=eveningFrom]').fill(week[0]);
	await f.locator('input[name=nightFrom]').fill(week[1]);
	await f.locator('input[name=nightTo]').fill(week[2]);
	await f.getByTestId('weekend-on').setChecked(!!weekend);
	if (weekend) {
		await f.locator('input[name=we_eveningFrom]').fill(weekend[0]);
		await f.locator('input[name=we_nightFrom]').fill(weekend[1]);
		await f.locator('input[name=we_nightTo]').fill(weekend[2]);
	}
	for (const [k, v] of Object.entries(brightness ?? { day: '100', evening: '55', night: '0', wake: '40' })) await f.locator(`input[name=b_${k}]`).fill(v);
	await f.getByRole('button', { name: 'Zapisz' }).click();
	await expect(page.locator('#ekran .ok')).toBeVisible();
}

test('Ekran: godziny tygodnia i weekendu, jasność dla agenta w /api/display', async ({ page, request }) => {
	await page.goto('/admin/ustawienia');
	// plan ekranu przeniesiony z Ustawień do własnej sekcji
	await expect(page.locator('input[name=nightFrom]')).toHaveCount(0);
	await page.locator('#admin-nav').getByRole('link', { name: 'Ekran', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Ekran', exact: true })).toBeVisible();
	// weekend wyłączony – pola nieaktywne
	await expect(page.locator('input[name=we_nightFrom]')).toBeDisabled();

	await saveScreen(page, ['21:00', '22:30', '06:00'], ['22:00', '00:30', '08:00'], { day: '80', evening: '30', night: '0', wake: '25' });
	await page.reload();
	await expect(page.getByTestId('weekend-on')).toBeChecked();
	await expect(page.locator('input[name=we_nightFrom]')).toHaveValue('00:30');
	await expect(page.locator('output').first()).toHaveText('80 %');
	const d = await (await request.get('/api/display')).json();
	expect(d.brightness).toEqual({ day: 80, evening: 30, night: 0, wake: 25 });
	expect(['day', 'evening', 'night']).toContain(d.phase);
	expect(d.level).toBe(d.brightness[d.phase]);

	// zła godzina – błąd w formularzu, zapis bez zmian
	await page.locator('input[name=b_day]').evaluate((el: HTMLInputElement) => (el.min = '0'));
	await page.locator('input[name=b_day]').fill('0');
	await page.getByRole('button', { name: 'Zapisz' }).click();
	await expect(page.locator('#ekran .err')).toContainText('Jasność');
	expect((await (await request.get('/api/display')).json()).brightness.day).toBe(80);

	await saveScreen(page, ['21:00', '23:00', '06:00']);
});

test('profil: awatar emoji i zdjęcie, urodziny z odliczaniem, imieniny w PL', async ({ page }) => {
	await page.goto('/admin/domownicy');
	const card = (id: string) => page.locator(`.card[data-member=${id}]`);

	// emoji z szybkiego wyboru i własne
	await card('kuba').locator('button.q', { hasText: '🦊' }).click();
	await expect(card('kuba').locator('.pic')).toContainText('🦊');
	await card('tata').locator('input[name=emoji]').fill('🧔');
	await card('tata').getByRole('button', { name: 'Ustaw' }).click();
	await expect(card('tata').locator('.pic')).toContainText('🧔');
	// za długie „emoji”
	await card('mama').locator('input[name=emoji]').fill('abc');
	await card('mama').getByRole('button', { name: 'Ustaw' }).click();
	await expect(page.locator('.toast.bad')).toContainText('Emoji');

	// zdjęcie: kwadrat 256 px zmniejszony w przeglądarce
	await card('ola').locator('input[name=photo]').setInputFiles({ name: 'ola.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page, 1200, 800, '#c026d3') });
	const img = card('ola').locator('.pic img');
	await expect(img).toHaveAttribute('src', /^\/media\/avatars\/ola-/);
	const size = await img.evaluate(async (el: HTMLImageElement) => {
		await el.decode();
		return [el.naturalWidth, el.naturalHeight];
	});
	expect(size).toEqual([256, 256]);

	// urodziny Kuby za 3 dni (bez roku), Tata obchodzi imieniny jako Witold
	await card('kuba').locator('input[name=birthday]').fill('2019-11-15');
	await card('kuba').locator('input[name=noYear]').check();
	await card('kuba').locator('form.member').getByRole('button', { name: 'Zapisz' }).click();
	await expect(card('kuba').locator('input[name=noYear]')).toBeChecked();
	await card('tata').locator('input[name=nameDay]').fill('Witold');
	await card('tata').locator('input[name=birthday]').fill('1984-11-12');
	await card('tata').locator('form.member').getByRole('button', { name: 'Zapisz' }).click();
	await expect(page.locator('.toast:not(.bad)')).toBeVisible();

	await page.goto(`/?at=${AT}`);
	await expect(page.getByTestId('birthday-countdown')).toHaveText(/Urodziny Kuby za 3 dni/);
	// dzisiejsze urodziny Taty jako wydarzenie całodniowe z wiekiem
	await expect(page.locator('.today .pill', { hasText: 'Urodziny Taty · 42 lata' })).toBeVisible();
	await expect(page.locator('.week .pill', { hasText: 'Urodziny Kuby' })).toBeVisible();
	// awatary obok imion
	await expect(page.locator('.pill .who', { hasText: 'Ola' }).first().locator('img.av')).toHaveAttribute('src', /\/media\/avatars\//);
	// region DE – bez imienin
	await expect(page.getByTestId('namedays')).toHaveCount(0);

	await page.goto('/admin/region');
	await page.locator('select[name=country]').selectOption('PL');
	await page.locator('select[name=timezone]').selectOption('Europe/Warsaw');
	await page.locator('form[action="?/saveRegion"]').getByRole('button').last().click();
	await expect(page.locator('select[name=country]')).toHaveValue('PL');
	await page.goto(`/?at=${AT}`);
	await expect(page.getByTestId('namedays')).toContainText('Dziś imieniny: Renaty, Witolda');
	await expect(page.getByTestId('namedays').locator('.feted')).toHaveText(/Tata/);

	// ustawienie modułu wyłącza imieniny
	await page.goto('/admin/birthdays');
	await page.locator('input[name=namedays]').uncheck();
	await page.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await expect(page.locator('#ustawienia-modulu .ok')).toBeVisible();
	await page.goto(`/?at=${AT}`);
	await expect(page.getByTestId('namedays')).toHaveCount(0);

	// sprzątanie: region, ustawienie, profile
	await page.goto('/admin/birthdays');
	await page.locator('input[name=namedays]').check();
	await page.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await page.goto('/admin/region');
	await page.locator('select[name=country]').selectOption('DE');
	await page.locator('select[name=timezone]').selectOption('Europe/Berlin');
	await page.locator('form[action="?/saveRegion"]').getByRole('button').last().click();
	await expect(page.locator('select[name=country]')).toHaveValue('DE');
	await page.goto('/admin/domownicy');
	for (const id of ['kuba', 'tata', 'ola']) {
		await card(id).getByRole('button', { name: 'Usuń awatar' }).click();
		await expect(card(id).getByRole('button', { name: 'Usuń awatar' })).toHaveCount(0);
		await card(id).locator('input[name=birthday]').fill('');
		await card(id).locator('input[name=nameDay]').fill('');
		await card(id).locator('form.member').getByRole('button', { name: 'Zapisz' }).click();
		await expect(card(id).locator('input[name=birthday]')).toHaveValue('');
	}
});

test('wygaszacz: zdjęcia z panelu, start po bezczynności, dotyk wraca, w nocy nie działa', async ({ page, request, context }) => {
	// wyłączony moduł – zdjęć nie ma pod adresem i nie ma sekcji panelu
	expect((await request.get('/admin/wygaszacz')).status()).toBe(404);
	await setModule(page, 'screensaver', true);
	await page.goto('/admin/wygaszacz');
	// zdjęcia z przerwanego wcześniejszego przebiegu (katalog media/ nie jest czyszczony z bazą)
	while (await page.locator('.photos li').count()) {
		const n = await page.locator('.photos li').count();
		await page.locator('.photos li').first().getByRole('button', { name: 'Usuń' }).click();
		await expect(page.locator('.photos li')).toHaveCount(n - 1);
	}
	await expect(page.getByText('Brak zdjęć')).toBeVisible();
	await page.getByTestId('photo-input').setInputFiles([
		{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page, 3000, 2000, '#2f6f4f') },
		{ name: 'b.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page, 900, 1400, '#1d2b53') }
	]);
	await page.getByRole('button', { name: 'Wyślij' }).click();
	await expect(page.locator('.photos li')).toHaveCount(2);
	await expect(page.getByText('2 zdjęcia')).toBeVisible();
	// zmniejszone w przeglądarce do 1920 px
	const src = await page.locator('.photos img').first().getAttribute('src');
	const big = await page.evaluate(async (u) => {
		const i = new Image();
		i.src = u!;
		await i.decode();
		return Math.max(i.naturalWidth, i.naturalHeight);
	}, src);
	expect(big).toBeLessThanOrEqual(1920);
	expect((await request.get(src!)).headers()['content-type']).toBe('image/jpeg');

	// start po 1 minucie
	await page.locator('input[name=idleMinutes]').fill('1');
	await page.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await expect(page.locator('#ustawienia-modulu .ok')).toBeVisible();

	const kiosk = await context.newPage();
	await kiosk.clock.install();
	await kiosk.goto('/');
	// po hydratacji (onMount dodaje klasę kiosku) – od tej chwili liczy się bezczynność
	await expect(kiosk.locator('body.kiosk')).toHaveCount(1);
	await kiosk.clock.fastForward('00:40');
	await expect(kiosk.getByTestId('screensaver')).toHaveCount(0);
	await kiosk.clock.fastForward('00:25');
	const saver = kiosk.getByTestId('screensaver');
	await expect(saver).toBeVisible();
	await expect(saver.locator('img.photo')).toHaveAttribute('src', /^\/media\/photos\//);
	await expect(saver.locator('.clock .time')).toHaveText(/^\d{2}:\d{2}$/);
	// dotknięcie: powrót do kalendarza, bez otwierania czegokolwiek pod spodem
	await saver.click({ position: { x: 1700, y: 300 } });
	await expect(saver).toHaveCount(0);
	await expect(kiosk.locator('.sheet')).toHaveCount(0);
	await kiosk.close();

	// noc (prawie cała doba) – wygaszacz nie startuje
	await saveScreen(page, ['00:00', '00:00', '23:59']);
	const night = await context.newPage();
	await night.clock.install();
	await night.goto('/');
	await expect(night.locator('body.kiosk')).toHaveCount(1);
	await expect(night.locator('html')).toHaveAttribute('data-phase', 'night');
	await night.clock.fastForward('02:00');
	await expect(night.getByTestId('screensaver')).toHaveCount(0);
	await night.close();
	await saveScreen(page, ['21:00', '23:00', '06:00']);

	// usuwanie zdjęć, wyłączenie modułu – adresy zdjęć 404
	await page.goto('/admin/wygaszacz');
	for (let n = 2; n > 0; n--) {
		await page.locator('.photos li').first().getByRole('button', { name: 'Usuń' }).click();
		await expect(page.locator('.photos li')).toHaveCount(n - 1);
	}
	await page.goto('/admin/wygaszacz');
	await page.locator('input[name=idleMinutes]').fill('5');
	await page.getByRole('button', { name: 'Zapisz ustawienia modułu' }).click();
	await setModule(page, 'screensaver', false);
	expect((await request.get(src!)).status()).toBe(404);
});
