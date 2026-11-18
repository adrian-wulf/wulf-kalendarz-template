import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { kioskPinOk, kioskSettingsAction, kioskSettingsState } from '#lib/server/kiosk-settings.js';
import { t } from '#lib/i18n/index.js';
import type { Cookies } from '@sveltejs/kit';

/** Ustawienia kiosku: tylko z ekranu kiosku, a gdy PIN jest ustawiony – po PIN-ie. */
function guard(locals: App.Locals, cookies: Cookies) {
	if (!locals.auth.kiosk) error(403, t('sec.kioskOnly'));
	if (!kioskPinOk(getDb(), cookies)) error(403, t('sec.pinRequired'));
}

export function GET({ locals, cookies }) {
	guard(locals, cookies);
	return json(kioskSettingsState(getDb()));
}

export function POST({ request, locals, cookies }) {
	guard(locals, cookies);
	return handle(request, (b) => kioskSettingsAction(getDb(), b));
}
