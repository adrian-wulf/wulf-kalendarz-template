import { expect, test, type Page } from '@playwright/test';

/**
 * 26b: przewodniki „Jak to ustawić?”, wpis wywozów na cały rok z podglądem i lista
 * „Co jeszcze możesz podłączyć” w przeglądzie panelu. Osobny projekt (po wszystkich, które
 * zmieniają stan aplikacji) – lista zależy od tego, co jest podłączone.
 */
test.describe.configure({ mode: 'serial' });
test.use({ extraHTTPHeaders: { 'tailscale-user-login': 'admin@test.local' } });

const day = (offset: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + offset * 86_400_000));
const progress = async (page: Page) => {
	const [done, total] = (await page.getByTestId('checklist-progress').innerText()).match(/\d+/g)!.map(Number);
	return { done, total };
};

test('przewodnik Google: otwiera się, kroki z adresem przekierowania, link w nowej karcie, sprawdzenie', async ({ page }) => {
	await page.goto('/admin/google');
	const guide = page.getByTestId('guide-google');
	// Nic jeszcze nie działa → pierwszy przewodnik otwarty.
	await expect(guide).toHaveAttribute('open', '');
	await guide.locator('summary').click();
	await expect(guide).not.toHaveAttribute('open', '');
	await guide.locator('summary').click();
	await expect(guide.locator('.gsteps li')).toHaveCount(9);
	await expect(guide.locator('.gsteps li').nth(5)).toContainText('https://kalendarz.test.ts.net/admin/google/callback');
	const link = guide.getByRole('link', { name: /Google Cloud/ });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', /noopener/);
	await expect(guide.getByTestId('guide-check')).toContainText('Jeszcze nie działa');
	await guide.getByRole('button', { name: 'Sprawdź teraz' }).click();
	await expect(guide.getByTestId('guide-check')).toContainText('nadal czegoś brakuje');
	// Zamknięcie zapamiętane na tym urządzeniu.
	await guide.locator('summary').click();
	await expect.poll(() => page.evaluate(() => localStorage.getItem('guide-open:google'))).toBe('0');
	await page.reload();
	await expect(page.getByTestId('guide-google')).not.toHaveAttribute('open', '');
});

test('przewodnik śmieci: wariant kraju z regionu, drugi kraj przełącznikiem; link z listy otwiera właściwy przewodnik', async ({ page }) => {
	await page.goto('/admin/dostep?guide=kiosk');
	await expect(page.getByTestId('guide-kiosk')).toHaveAttribute('open', '');
	await expect(page.getByTestId('guide-phones')).not.toHaveAttribute('open', '');
	await expect(page.getByTestId('guide-kiosk').locator('img').first()).toHaveAttribute('src', '/guides/kiosk-pin-pl.webp');

	await page.goto('/admin/smieci?guide=waste');
	const guide = page.getByTestId('guide-waste');
	const pressed = guide.locator('.variants button[aria-pressed=true]');
	const first = await pressed.getAttribute('data-variant');
	const other = first === 'DE' ? 'PL' : 'DE';
	const step1 = await guide.locator('.gsteps li').first().innerText();
	await guide.locator(`.variants button[data-variant=${other}]`).click();
	await expect(guide.locator(`.variants button[data-variant=${other}]`)).toHaveAttribute('aria-pressed', 'true');
	await expect(guide.locator('.gsteps li').first()).not.toHaveText(step1);
	await expect(guide.locator('.gsteps li').first()).toContainText(other === 'DE' ? 'Abfuhrkalender' : 'harmonogram');
});

test('lista „Co jeszcze możesz podłączyć”, wywozy na cały rok z podglądem, postęp i ukrywanie', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/admin');
	const list = page.getByTestId('checklist');
	await expect(list.locator('[data-tip=google]')).toHaveAttribute('data-state', 'todo');
	await expect(list.locator('[data-tip=calendars] a')).toHaveAttribute('href', '/admin/kalendarze');
	const before = await progress(page);
	const wasteBefore = await list.locator('[data-tip=waste]').getAttribute('data-state');
	expect(wasteBefore).toBe('todo');

	// Z listy prosto do sekcji Śmieci, z otwartym przewodnikiem.
	await list.locator('[data-tip=waste]').getByRole('link').click();
	await expect(page).toHaveURL(/\/admin\/smieci\?guide=waste/);
	await expect(page.getByTestId('guide-waste')).toHaveAttribute('open', '');
	// Serwer testów ma dane przykładowe – zamiast pustego stanu przykładowe terminy z podpowiedzią.
	await expect(page.getByTestId('waste-upcoming')).toBeVisible();

	// Seria: co tydzień od za 7 dni do za 42 dni → 6 terminów, podgląd przed zapisem.
	const form = page.getByTestId('waste-year');
	await expect(form.getByTestId('year-save')).toBeDisabled();
	await form.getByTestId('year-first').fill(day(7));
	await form.getByTestId('year-every').selectOption('1');
	await form.getByTestId('year-to').fill(day(42));
	await expect(form.getByTestId('year-preview')).toContainText('6 terminów');
	await expect(form.getByTestId('year-preview').locator('.day')).toHaveCount(6);
	await form.getByTestId('year-save').click();
	await expect(page.getByTestId('waste-year-saved')).toHaveText('✓ Dodano 6 terminów.');
	await expect(page.locator(`[data-testid=waste-upcoming] .chip[data-date="${day(7)}"]`)).toBeVisible();
	// Po zapisie pole daty jest puste – drugi klik nie zapisze tego samego.
	await expect(form.getByTestId('year-first')).toHaveValue('');

	// Wklejone daty: dwie poprawne, jedna nie do odczytania.
	await form.getByLabel('Wklej daty').check();
	const [y, m, d] = day(20).split('-');
	await form.getByTestId('year-text').fill(`${d}.${m}.${y}\n${day(22)}, ${day(14)}\n31.02.${y}`);
	await expect(form.getByTestId('year-preview')).toContainText('3 terminy');
	// day(14) jest już w serii z poprzedniego zapisu – podgląd o tym mówi, zapis go pomija.
	await expect(form.getByTestId('year-already')).toContainText('1 z tych dat jest już wpisana');
	await expect(form.getByTestId('year-preview')).toContainText('Nie odczytano: 31.02');
	await form.getByTestId('year-save').click();
	await expect(page.getByTestId('waste-year-saved')).toHaveText('✓ Dodano 2 terminy.');
	await expect(page.getByTestId('guide-waste').locator('summary .pill')).toContainText('działa');

	// Postęp w przeglądzie: śmieci gotowe.
	await page.goto('/admin');
	await expect(list.locator('[data-tip=waste]')).toHaveAttribute('data-state', 'done');
	expect(await progress(page)).toEqual({ done: before.done + 1, total: before.total });

	// „Nie potrzebuję” – pozycja znika i nie liczy się do postępu; „Pokaż ukryte” przywraca.
	await list.getByRole('button', { name: 'Nie potrzebuję: Lista zakupów w Bring!' }).click();
	await expect(list.locator('[data-tip=bring]')).toHaveCount(0);
	expect(await progress(page)).toEqual({ done: before.done + 1, total: before.total - 1 });
	await list.getByRole('button', { name: /Pokaż ukryte \(1\)/ }).click();
	await expect(list.locator('[data-tip=bring]')).toBeVisible();
	expect(await progress(page)).toEqual({ done: before.done + 1, total: before.total });

	// Sprzątanie: wszystkie ręczne terminy usunięte – znów pusty stan.
	await page.goto('/admin/smieci');
	for (const bin of await page.locator('#smieci details.bin-list').all()) {
		await bin.locator('summary').click();
		await bin.getByRole('button', { name: /Usuń wszystkie/ }).click();
	}
	await expect(page.locator('#smieci details.bin-list')).toHaveCount(0);
	await page.goto('/admin');
	await expect(list.locator('[data-tip=waste]')).toHaveAttribute('data-state', 'todo');
});

test('pusty stan kopii: tylko na tym komputerze → formularz „Dodaj miejsce” otwarty', async ({ page }) => {
	await page.goto('/admin/kopie');
	await expect(page.getByTestId('backup-empty')).toContainText('Kopie są tylko na tym komputerze');
	await page.getByTestId('backup-empty').getByRole('link').click();
	await expect(page.locator('details#dodaj-miejsce')).toHaveAttribute('open', '');
});
