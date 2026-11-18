import type { Cookies } from '@sveltejs/kit';
import qrcode from 'qrcode-generator';
import type { DB } from './db/index.js';
import { runtimeAuth } from './auth-runtime.js';
import { parseOrigins } from '../../../server/origin.js';
import { firstRunCode, hasPin, hasPinGrant, PIN_COOKIE } from './security.js';
import { getSetting, setSetting, activeSources, refreshNow } from './sync.js';
import { getTheme, setTheme } from './theme.js';
import { getLayout, setLayout } from './layout.js';
import { InputError } from './store.js';
import { displayState } from './screen.js';
import { setKv } from './kv.js';
import { modulesSetting, saveModules, isActive } from '#lib/modules/registry.server.js';
import { PRESETS, presetById } from '#lib/theme.js';
import { LAYOUT_PRESETS, presetOf, presetName } from '#lib/layout.js';
import { brightnessOf, phaseAt } from '#lib/logic/schedule.js';
import { t } from '#lib/i18n/index.js';

/**
 * Ustawienia na kiosku (przytrzymanie zegara → PIN → arkusz): tylko rzeczy lokalne i bezpieczne –
 * motyw, układ, jasność na teraz, wygaszacz, ponowna synchronizacja i adres panelu z kodem QR.
 * Domownicy, konta, kalendarze i hasła zostają w panelu.
 *
 * Safe kiosk-local settings behind the PIN.
 */

/**
 * Czy kiosk może teraz zmienić ustawienia / usunąć: bez PIN-u – tak (chyba że `needPin`, np. zgoda na nagrodę),
 * z PIN-em – tylko z ważną zgodą (ciasteczko po wpisaniu PIN-u).
 */
export function kioskPinOk(db: DB, cookies: Cookies, needPin = false): boolean {
	if (!hasPin(db)) return !needPin;
	return hasPinGrant(db, runtimeAuth(), cookies.get(PIN_COOKIE));
}

/** Publiczny adres aplikacji: PUBLIC_ORIGIN albo pierwszy adres https z TRUSTED_ORIGINS. */
export function publicOrigin(env: Record<string, string | undefined> = process.env): string | null {
	const list = [env.PUBLIC_ORIGIN, ...[...parseOrigins(env.TRUSTED_ORIGINS).origins].filter((o) => o.startsWith('https://'))];
	for (const raw of list) {
		try {
			if (raw?.trim()) return new URL(raw.trim()).origin;
		} catch {
			/* niepoprawny – następny */
		}
	}
	return null;
}

/** Kod QR jako SVG (ścieżka z ciemnych modułów, z marginesem 4 modułów). */
export function qrSvg(text: string): string {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const n = qr.getModuleCount();
	let d = '';
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
	const size = n + 8;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const BRIGHTNESS_STEPS = [10, 25, 50, 75, 100];

/** Jasność „na teraz” z kiosku – dopóki nie zmieni się pora dnia (najwyżej 12 h); liczy ją `displayState`. */
export function brightnessOverride(db: DB, now = new Date()): number | null {
	const o = getSetting(db, 'brightnessNow');
	if (!o) return null;
	return o.phase === displayState(db, now).phase && Date.parse(o.until) > now.getTime() ? o.level : null;
}

export function kioskSettingsState(db: DB, now = new Date()) {
	const theme = getTheme(db);
	const layout = getLayout(db);
	const origin = publicOrigin();
	const schedule = getSetting(db, 'schedule');
	const phase = phaseAt(now, schedule);
	return {
		theme: theme.preset,
		themes: PRESETS.map((p) => ({ id: p.id, name: p.name, bg: p.day.bg, card: p.day.card, fg: p.day.fg })),
		layout: layout.preset,
		layouts: LAYOUT_PRESETS.map((p) => ({ id: p.id, name: presetName(p.id) })),
		screensaver: { active: isActive(db, 'screensaver') },
		brightness: { steps: BRIGHTNESS_STEPS, plan: brightnessOf(schedule)[phase], now: brightnessOverride(db, now) },
		links: origin ? { phone: `${origin}/telefon`, admin: `${origin}/admin`, qrPhone: qrSvg(`${origin}/telefon`), qrAdmin: qrSvg(`${origin}/admin`) } : null,
		authMode: runtimeAuth().mode,
		pin: hasPin(db),
		/** Tryb hasła bez hasła: kod do ustawienia hasła na /login (dowód dostępu do ekranu). */
		setupCode: firstRunCode(db, runtimeAuth())
	};
}

export type KioskAction =
	| { action: 'theme'; value: string }
	| { action: 'layout'; value: string }
	| { action: 'screensaver'; value: boolean }
	| { action: 'brightness'; value: number | null }
	| { action: 'sync' };

export async function kioskSettingsAction(db: DB, body: Record<string, unknown>, now = new Date()) {
	const value = body.value;
	switch (body.action) {
		case 'theme': {
			const preset = presetById(String(value));
			if (!preset) throw new InputError(t('err.theme'));
			// Gotowy motyw w całości (jak „Przywróć kolory” w panelu) z krojem proponowanym przez motyw.
			setTheme(db, { ...getTheme(db), preset: preset.id, font: preset.font, overrides: {}, evening: 'auto' });
			return { ok: true };
		}
		case 'layout': {
			const p = presetOf(String(value));
			if (!p) throw new InputError(t('sec.err.layout'));
			setLayout(db, { ...getLayout(db), preset: p.id });
			return { ok: true };
		}
		case 'screensaver': {
			const cur = modulesSetting(db);
			saveModules(db, { ...cur, screensaver: { ...cur.screensaver, enabled: value === true } });
			return { ok: true, active: isActive(db, 'screensaver') };
		}
		case 'brightness': {
			if (value === null) {
				setKv(db, 'brightnessNow', null);
				return { ok: true };
			}
			const level = Number(value);
			if (!Number.isInteger(level) || level < 5 || level > 100) throw new InputError(t('sec.err.brightness'));
			const phase = phaseAt(now, getSetting(db, 'schedule'));
			setSetting(db, 'brightnessNow', { level, phase, until: new Date(now.getTime() + 12 * 3600_000).toISOString() });
			return { ok: true };
		}
		case 'sync': {
			const sources = activeSources(db);
			const results = await Promise.all(sources.map((s) => refreshNow(db, s.name).catch(() => false)));
			return { ok: true, total: sources.length, failed: results.filter((r) => !r).length };
		}
		default:
			throw new InputError(t('sec.err.action'));
	}
}
