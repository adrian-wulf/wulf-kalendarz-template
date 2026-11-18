import { expect, type Page } from '@playwright/test';

/** Wspólne dla testów e2e modułów leki, opieka, odjazdy i Home Assistant (pliki *.modules.test.ts). */

export const ADMIN = { 'tailscale-user-login': 'admin@test.local' };
/** Atrapy HAFAS/GTFS/HA – patrz e2e/p3c-mock.mjs i playwright.config.ts. */
export const MOCK = `http://localhost:${Number(process.env.E2E_PORT ?? 4173) + 10}`;

export async function setModule(page: Page, id: string, on: boolean) {
	await page.goto('/admin');
	const row = page.locator(`#moduly [data-module=${id}]`);
	const want = on ? 'Wyłącz' : 'Włącz';
	if (await row.getByRole('button', { name: want }).isVisible()) return;
	await row.getByRole('button', { name: on ? 'Włącz' : 'Wyłącz' }).click();
	await expect(row.getByRole('button', { name: want })).toBeVisible();
}

/** Zapis formularza ustawień modułu (generowany ze schematu) na stronie sekcji. */
export async function saveConfig(page: Page, values: Record<string, string>) {
	const form = page.locator('#ustawienia-modulu form');
	for (const [k, v] of Object.entries(values)) {
		const el = form.locator(`[name="${k}"]`);
		if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(v);
		else await el.fill(v);
	}
	await form.getByRole('button').click();
	await expect(page.locator('#ustawienia-modulu .ok')).toBeVisible();
}
