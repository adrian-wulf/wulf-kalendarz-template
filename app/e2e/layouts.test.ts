import { expect, test, type Page } from '@playwright/test';

const AT = encodeURIComponent('2026-11-12T11:00:00+01:00');

/** Każdy układ w docelowej rozdzielczości: czytelny, bez przewijania i bez wystających elementów. */
const CASES = [
	{ preset: 'today-week', w: 1920, h: 1080, days: '.week .day', count: 7, text: '.week .pill .text', min: 20 },
	{ preset: 'week', w: 1920, h: 1080, days: '.week .day', count: 7, text: '.week .pill .text', min: 22 },
	{ preset: 'month', w: 1920, h: 1080, days: '.month .cell', count: 35, text: '.month .ev', min: 22 },
	{ preset: 'portrait', w: 1080, h: 1920, days: '.week .day', count: 7, text: '.week .pill .text', min: 22 },
	{ preset: 'small', w: 1280, h: 800, days: '.week .day', count: 4, text: '.week .pill .text', min: 22 }
];

async function inside(page: Page, selector: string) {
	const vp = page.viewportSize()!;
	for (const el of await page.locator(selector).all()) {
		const b = (await el.boundingBox())!;
		expect(b, selector).not.toBeNull();
		expect(b.x, `${selector} x`).toBeGreaterThanOrEqual(-0.5);
		expect(b.y, `${selector} y`).toBeGreaterThanOrEqual(-0.5);
		expect(b.x + b.width, `${selector} prawa krawędź`).toBeLessThanOrEqual(vp.width + 0.5);
		expect(b.y + b.height, `${selector} dolna krawędź`).toBeLessThanOrEqual(vp.height + 0.5);
	}
}

for (const c of CASES) {
	test.describe(`układ ${c.preset} ${c.w}×${c.h}`, () => {
		test.use({ viewport: { width: c.w, height: c.h } });

		test('mieści się na ekranie i jest czytelny', async ({ page }) => {
			await page.goto(`/?at=${AT}&layout=${c.preset}`);
			const main = page.locator(`main[data-layout="${c.preset}"]`);
			await expect(main).toBeVisible();
			// Płótno = ekran (skala 1), więc rozmiary CSS to piksele ekranu.
			await expect(page.locator('.stage')).toHaveAttribute('data-canvas', `${c.w}x${c.h}`);

			const overflow = await page.evaluate(() => {
				const d = document.documentElement;
				const m = document.querySelector('main')!;
				return { page: d.scrollWidth - d.clientWidth, w: m.scrollWidth - m.clientWidth, h: m.scrollHeight - m.clientHeight };
			});
			expect(overflow).toEqual({ page: 0, w: 0, h: 0 });

			await expect(page.locator(c.days)).toHaveCount(c.count);
			await expect(page.locator('.today .clock')).toHaveText('11:00');
			await expect(page.locator('[data-tile]')).toHaveCount(3);
			await inside(page, `.today, .week, .month, [data-tile], .navbtn, ${c.days}`);

			// Tekst wydarzeń z daleka: co najmniej 22 px (dziś + tydzień bez zmian od pierwszej wersji).
			const sizes = await page.locator(c.text).evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
			expect(sizes.length).toBeGreaterThan(3);
			expect(Math.min(...sizes)).toBeGreaterThanOrEqual(c.min);
			const today = await page.locator('.today .pill.big').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
			expect(Math.min(...today)).toBeGreaterThanOrEqual(22);
		});
	});
}

test.describe('układ miesiąca', () => {
	test('dotknięcie dnia otwiera jego szczegóły', async ({ page }) => {
		await page.goto(`/?at=${AT}&layout=month`);
		await page.locator('.month .cell[data-date="2026-11-18"]').click();
		await expect(page.getByRole('heading', { name: 'Śr 18 listopada' })).toBeVisible();
		await expect(page.locator('.sheet')).toContainText('Kita zamknięta');
		await page.getByRole('button', { name: '✕ Anuluj' }).click();
		// Przeszłe dni bieżącego tygodnia są wygaszone, dziś wyróżnione.
		await expect(page.locator('.cell.today')).toHaveAttribute('data-date', '2026-11-12');
		await expect(page.locator('.cell.past')).toHaveCount(3);
	});
});

test.describe('pionowy: okna na węższej warstwie', () => {
	test.use({ viewport: { width: 1080, height: 1920 } });
	test('dodawanie mieści się na ekranie razem z klawiaturą', async ({ page }) => {
		await page.goto(`/?at=${AT}&layout=portrait`);
		await page.getByRole('button', { name: '+ Dodaj' }).click();
		await page.locator('.grid .tile').first().click();
		await expect(page.locator('.kb')).toBeVisible();
		await inside(page, '.sheet, .kb .key');
	});
});

test.describe('rozdzielczość z ustawień', () => {
	test.use({ viewport: { width: 1280, height: 800 } });
	test('dziś + tydzień na 16:10 dostaje szersze płótno zamiast pasów', async ({ page }) => {
		await page.goto(`/?at=${AT}&layout=today-week&res=1280x800`);
		await expect(page.locator('.stage')).toHaveAttribute('data-canvas', '1728x1080');
		await inside(page, '.today, .week, [data-tile]');
		// Pionowy układ na poziomym ekranie – płótno 1080×1920 z pasami, w całości widoczne.
		await page.goto(`/?at=${AT}&layout=portrait`);
		await expect(page.locator('.stage')).toHaveAttribute('data-canvas', '1080x1920');
		await inside(page, '.today, .week, [data-tile]');
	});
});
