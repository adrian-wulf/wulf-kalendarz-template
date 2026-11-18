// Zrzuty ekranu do README i artykułu: `npm run screenshots` (buduje aplikację, potem ten skrypt).
// Screenshots for the README and the article: `npm run screenshots` (builds the app, then runs this).
//
// Trzy serwery na zbudowanej aplikacji (`node server`) z danymi demo (DEMO=1) i stałym zegarem
// (scripts/fake-clock.mjs – czwartek 12.11.2026, 15:40): rodzina z Poznania (PL, motyw Papier),
// rodzina z Hanoweru (DE, motyw Noc) i świeża instalacja dla kreatora. Kiosk dodatkowo z `?at=`.
// Wynik: docs/screenshots/*.webp (WebP koduje sam Chromium – bez dodatkowych zależności).
//
// --- 26b: guides --- Do tego zrzuty do przewodników w panelu (kroki „Jak to ustawić?”) w trzech językach:
// app/static/guides/<nazwa>-<pl|de|en>.webp (czwarty serwer: demo po angielsku). Tylko one: SHOTS_ONLY=guides.
//
// Opcje: SHOTS_PORT (domyślnie 4600, zajmuje 4 kolejne porty), SHOTS_ONLY=nazwa,nazwa (tylko wybrane),
// SHOTS_QUALITY (0–1, domyślnie 0.86), SHOTS_PNG=katalog (dodatkowo surowe PNG do przeglądu).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(APP, '../docs/screenshots');
const NOW = '2026-11-12T15:40:00+01:00';
const AT = encodeURIComponent(NOW);
const PORT = Number(process.env.SHOTS_PORT ?? 4600);
const QUALITY = Number(process.env.SHOTS_QUALITY ?? 0.86);
const ONLY = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null;
const PNG_DIR = process.env.SHOTS_PNG ? resolve(process.env.SHOTS_PNG) : null;
const ADMIN = { 'tailscale-user-login': 'admin@example.com' };

const tmp = mkdtempSync(join(tmpdir(), 'kalendarz-shots-'));
const servers = [];

function start(name, port, env) {
	const p = spawn(process.execPath, ['--import', './scripts/fake-clock.mjs', 'server'], {
		cwd: APP,
		env: {
			...process.env,
			PORT: String(port),
			DATABASE_PATH: join(tmp, name, 'kalendarz.db'),
			ADMIN_LOGINS: ADMIN['tailscale-user-login'],
			TRUSTED_ORIGINS: `http://localhost:${port}`,
			PUBLIC_ORIGIN: 'https://kalendarz.example.ts.net',
			FAKE_NOW: NOW,
			DEMO_RESET: 'off',
			...env
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let log = '';
	p.stdout.on('data', (d) => (log += d));
	p.stderr.on('data', (d) => (log += d));
	p.on('exit', (code) => code && code !== 143 && console.error(`[${name}] koniec (${code}):\n${log}`));
	servers.push(p);
	return { url: `http://localhost:${port}`, log: () => log };
}

async function ready(url, ms = 60_000) {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		try {
			if ((await fetch(url, { redirect: 'manual' })).status < 500) return;
		} catch {
			/* jeszcze nie słucha */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`${url} nie odpowiada`);
}

function stopAll() {
	for (const s of servers) s.kill('SIGTERM');
	rmSync(tmp, { recursive: true, force: true });
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

const pl = start('pl', PORT, { DEMO: '1', DEMO_LANG: 'pl' });
const de = start('de', PORT + 1, { DEMO: '1', DEMO_LANG: 'de', DEMO_THEME: 'noc' });
const setup = start('setup', PORT + 2, {});
// --- 26b: guides ---
const en = start('en', PORT + 3, { DEMO: '1', DEMO_LANG: 'en' });
await Promise.all([pl, de, setup, en].map((s) => ready(s.url)));

const browser = await chromium.launch();
const encoder = await browser.newPage();
const written = [];

/** PNG z Playwrighta → WebP (canvas w Chromium). `dir` – inny katalog docelowy (zrzuty do przewodników). */
async function save(name, png, dir = OUT, quality = QUALITY) {
	if (PNG_DIR) {
		mkdirSync(PNG_DIR, { recursive: true });
		writeFileSync(join(PNG_DIR, `${name}.png`), png);
	}
	const dataUrl = await encoder.evaluate(
		async ({ b64, q }) => {
			const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
			const c = document.createElement('canvas');
			c.width = img.width;
			c.height = img.height;
			c.getContext('2d').drawImage(img, 0, 0);
			return c.toDataURL('image/webp', q);
		},
		{ b64: png.toString('base64'), q: quality }
	);
	if (!dataUrl.startsWith('data:image/webp')) throw new Error('Chromium nie zakodował WebP');
	const file = join(dir, `${name}.webp`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
	written.push({ name, kb: Math.round(statSync(file).size / 1024) });
	console.log(`✓ ${name}.webp (${written.at(-1).kb} KB)`);
}

/** Nowa karta z kontekstem: rozmiar, nagłówki, stały zegar przeglądarki. */
async function open(base, { width, height, scale = 1, headers, mobile = false, cookies = [] }) {
	const ctx = await browser.newContext({
		baseURL: base.url,
		viewport: { width, height },
		deviceScaleFactor: scale,
		isMobile: mobile,
		hasTouch: true,
		extraHTTPHeaders: headers,
		locale: 'pl-PL'
	});
	if (cookies.length) await ctx.addCookies(cookies.map((c) => ({ ...c, url: base.url })));
	const page = await ctx.newPage();
	await page.clock.install({ time: new Date(NOW) });
	return page;
}

/** Czcionki załadowane, animacje wejścia skończone. */
async function settle(page, ms = 500) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(ms);
}

const want = (name) => !ONLY || ONLY.has(name);

async function shot(name, fn) {
	if (!want(name)) return;
	const page = await fn();
	await settle(page);
	await save(name, await page.screenshot({ animations: 'disabled' }));
	await page.context().close();
}

// --- Kiosk ---

const kiosk = (base, w, h, layout) => async () => {
	const page = await open(base, { width: w, height: h });
	await page.goto(`/?at=${AT}&layout=${layout}`);
	await page.locator(`main[data-layout="${layout}"]`).waitFor();
	return page;
};

await shot('kiosk-week-papier-pl', kiosk(pl, 1920, 1080, 'today-week'));
await shot('kiosk-week-noc-de', kiosk(de, 1920, 1080, 'today-week'));
await shot('kiosk-month-pl', kiosk(pl, 1920, 1080, 'month'));
await shot('kiosk-portrait-pl', kiosk(pl, 1080, 1920, 'portrait'));
await shot('kiosk-small-pl', kiosk(pl, 1280, 800, 'small'));

// Klawiatura PIN-u: przytrzymanie zegara (bez `?at=` – zamrożony kiosk nie otwiera ustawień).
await shot('kiosk-pin-pl', async () => {
	const page = await open(pl, { width: 1920, height: 1080 });
	await page.goto('/');
	const clock = page.getByTestId('clock');
	await clock.waitFor();
	const box = await clock.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.getByTestId('pinpad').waitFor({ timeout: 10_000 });
	await page.mouse.up();
	for (const d of '12') await page.locator(`[data-testid=pinpad] [data-key="${d}"]`).click();
	return page;
});

// Wygaszacz: zegar przeglądarki przesunięty o bezczynność; pierwsze zdjęcie zawsze to samo.
await shot('kiosk-screensaver-pl', async () => {
	const page = await open(pl, { width: 1920, height: 1080 });
	await page.addInitScript(() => (Math.random = () => 0));
	await page.goto('/');
	await page.getByTestId('clock').waitFor();
	await page.clock.fastForward('04:00');
	await page.locator('.saver img, [data-testid=screensaver] img').first().waitFor({ timeout: 10_000 });
	await page.waitForTimeout(1500);
	return page;
});

// --- 26a: calendar layers --- „Kalendarze” na kiosku: szybkie ukrywanie do północy.
await shot('kiosk-calendars-pl', async () => {
	const page = await kiosk(pl, 1920, 1080, 'today-week')();
	await page.getByTestId('layers-button').click();
	await page.getByTestId('layers-sheet').waitFor();
	return page;
});

// --- Telefon ---

const phone = (path) => async () => {
	const page = await open(pl, { width: 390, height: 844, scale: 2, mobile: true, headers: ADMIN, cookies: [{ name: 'kal_member', value: 'kasia' }] });
	await page.addInitScript(() => localStorage.setItem('telefonDomownik', 'kasia'));
	await page.goto(path);
	await page.waitForLoadState('networkidle');
	return page;
};

await shot('phone-notes-pl', phone('/telefon/kartki'));
await shot('phone-meals-pl', phone('/telefon/posilki'));
await shot('phone-kids-pl', phone('/telefon/dzieci'));
await shot('phone-calendar-pl', phone('/telefon/kalendarz'));

// --- Panel ---

const admin = (path, scrollTo) => async () => {
	const page = await open(pl, { width: 1440, height: 900, headers: ADMIN });
	await page.goto(path);
	// Baner „tryb demo” nie należy do produktu – na zrzutach bez niego.
	await page.addStyleTag({ content: '.demo-banner{display:none!important}' });
	// Panel przewija `.scroll` (nie okno) – sekcja 24 px od góry.
	if (scrollTo) await page.locator(scrollTo).evaluate((el) => (el.closest('.scroll').scrollTop += el.getBoundingClientRect().top - 24));
	await page.waitForLoadState('networkidle');
	return page;
};

await shot('admin-overview-pl', admin('/admin'));
await shot('admin-modules-pl', admin('/admin', '#moduly'));
await shot('admin-meals-pl', admin('/admin/posilki'));
await shot('admin-calendars-pl', admin('/admin/kalendarze'));

// --- Kreator (świeża instalacja, krok po kroku jak na kiosku) ---

if (want('setup-members-pl') || want('setup-theme-pl')) {
	const page = await open(setup, { width: 1920, height: 1080 });
	const next = () => page.getByTestId('next').click();
	const title = (text) => page.locator('h1', { hasText: text }).waitFor();
	await page.goto('/setup');
	await title('Wybierz język');
	await next();
	await title('Gdzie mieszkacie?');
	await page.getByTestId('country-PL').click();
	await page.getByRole('button', { name: 'wielkopolskie' }).click();
	await next();
	await title('Miejscowość do pogody');
	await page.getByTestId('place-manual').click();
	await page.getByTestId('place-lat').fill('52,41');
	await page.getByTestId('place-lon').fill('16,93');
	await next();
	await title('Kto mieszka w domu?');
	const names = ['Marek', 'Kasia', 'Zosia', 'Kuba', 'Babcia'];
	for (const [i, n] of names.entries()) {
		if (i) await page.getByTestId('member-add').click();
		await page.getByTestId('member-name').nth(i).fill(n);
	}
	await page.locator('h1').click();
	await settle(page);
	if (want('setup-members-pl')) await save('setup-members-pl', await page.screenshot({ animations: 'disabled' }));
	await next();
	await title('Co ma być na ekranie?');
	await next();
	await title('Wybierz motyw');
	await page.getByTestId('theme-papier').click();
	await settle(page, 700);
	if (want('setup-theme-pl')) await save('setup-theme-pl', await page.screenshot({ animations: 'disabled' }));
	await page.context().close();
}

// --- 26b: guides --- zrzuty do kroków przewodników: małe wycinki, w języku panelu
const GUIDE_OUT = resolve(APP, 'static/guides');
const GUIDE_QUALITY = Number(process.env.SHOTS_GUIDE_QUALITY ?? 0.8);
const wantGuide = (name) => !ONLY || ONLY.has('guides') || ONLY.has(name);
const LANG_SERVERS = { pl, de, en };

async function guideShot(name, lang, fn) {
	if (!wantGuide(`${name}-${lang}`)) return;
	const page = await fn(LANG_SERVERS[lang]);
	await settle(page);
	const target = page.__shotTarget;
	const png = target ? await target.screenshot({ animations: 'disabled' }) : await page.screenshot({ animations: 'disabled', clip: page.__clip });
	await save(`${name}-${lang}`, png, GUIDE_OUT, GUIDE_QUALITY);
	await page.context().close();
}

/** Przytrzymanie zegara i PIN demo – klawiatura PIN-u albo (z `enter`) ustawienia kiosku. */
async function holdClock(page, enter) {
	await page.goto('/');
	const clock = page.getByTestId('clock');
	await clock.waitFor();
	const box = await clock.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.getByTestId('pinpad').waitFor({ timeout: 10_000 });
	await page.mouse.up();
	for (const d of enter ? ['1', '2', '3', '4', 'ok'] : ['1', '2']) await page.locator(`[data-testid=pinpad] [data-key="${d}"]`).click();
}

for (const lang of ['pl', 'de', 'en']) {
	// Kiosk: klawiatura PIN-u po przytrzymaniu zegara (pomniejszony ekran).
	await guideShot('kiosk-pin', lang, async (base) => {
		const page = await open(base, { width: 1280, height: 720 });
		await holdClock(page, false);
		return page;
	});
	// Kiosk: ustawienia po PIN-ie – kod QR dla telefonów.
	await guideShot('kiosk-qr', lang, async (base) => {
		const page = await open(base, { width: 1280, height: 720 });
		await holdClock(page, true);
		const links = page.locator('[data-testid=kiosk-settings] section.links');
		await links.waitFor({ timeout: 10_000 });
		await links.scrollIntoViewIfNeeded();
		// Tylko nagłówek i kod „Telefon”.
		const a = await links.boundingBox();
		const fig = await links.locator('figure').first().boundingBox();
		page.__clip = { x: a.x - 12, y: a.y - 12, width: fig.x + fig.width - a.x + 24, height: fig.y + fig.height - a.y + 24 };
		return page;
	});
	// Telefon: górna część ekranu po wybraniu domownika.
	await guideShot('phone-home', lang, async (base) => {
		const page = await open(base, { width: 390, height: 844, mobile: true, headers: ADMIN });
		await page.goto('/telefon');
		await page.waitForLoadState('networkidle');
		// Bez wybranego domownika – widać „Kim jesteś?”, tak jak po pierwszym otwarciu.
		page.__clip = { x: 0, y: 0, width: 390, height: 600 };
		return page;
	});
	// Panel → Śmieci: „cały rok” z podglądem (papier co 2 tygodnie od najbliższego czwartku).
	await guideShot('waste-year', lang, async (base) => {
		const page = await open(base, { width: 1100, height: 900, headers: ADMIN });
		await page.goto('/admin/smieci');
		await page.addStyleTag({ content: '.demo-banner{display:none!important}' });
		const form = page.getByTestId('waste-year');
		await form.locator('select[name=bin]').selectOption({ index: 1 });
		await form.getByTestId('year-first').fill('2026-11-19');
		await form.getByTestId('year-every').selectOption('2');
		await form.getByTestId('year-to').fill('2027-06-30');
		await form.getByTestId('year-preview').locator('.month').first().waitFor();
		page.__shotTarget = form;
		return page;
	});
	// Panel → Odjazdy: wyszukiwarka przystanku z wynikami (ostrzeżenie o źródle z demo ukryte).
	await guideShot('transit-stop', lang, async (base) => {
		const page = await open(base, { width: 1100, height: 900, headers: ADMIN });
		await page.goto(`/admin/odjazdy?q=${lang === 'pl' ? 'Rondo' : 'Linden'}`);
		await page.addStyleTag({ content: '.demo-banner,[data-testid=transit-wrong-country]{display:none!important}' });
		const search = page.locator('#odjazdy form.search');
		await search.waitFor();
		await search.evaluate((el) => (el.closest('.scroll').scrollTop += el.getBoundingClientRect().top - 16));
		const a = await search.boundingBox();
		const b = await page.locator('#odjazdy .hits').boundingBox();
		page.__clip = { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: b.y + b.height - a.y + 16 };
		return page;
	});
	// Panel → Home Assistant: lista encji do zaznaczenia (w demo sekcja tylko do podglądu – bez wyszarzenia).
	await guideShot('ha-entities', lang, async (base) => {
		const page = await open(base, { width: 1100, height: 900, headers: ADMIN });
		await page.goto('/admin/home-assistant');
		await page.addStyleTag({ content: '.demo-banner,[data-testid=demo-lock] .note{display:none!important} .locked{opacity:1!important;filter:none!important}' });
		const ents = page.locator('#home-assistant form.ents');
		await ents.waitFor();
		await ents.evaluate((el) => (el.closest('.scroll').scrollTop += el.getBoundingClientRect().top - 64));
		const box = await ents.boundingBox();
		page.__clip = { x: box.x - 8, y: box.y - 48, width: box.width + 16, height: Math.min(box.height + 56, 420) };
		return page;
	});
}

await browser.close();
const total = written.reduce((s, w) => s + w.kb, 0);
console.log(`\n${written.length} zrzutów, razem ${(total / 1024).toFixed(2)} MB → ${OUT}`);
if (total > 5 * 1024) {
	console.error('Razem ponad 5 MB – obniż SHOTS_QUALITY.');
	process.exitCode = 1;
}
// Serwery potomne trzymają proces – kończymy jawnie.
process.exit();
