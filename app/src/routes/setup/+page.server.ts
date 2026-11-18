import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { finishSetup, goToStep, saveStep, setLanguage, setupData, SetupError } from '#lib/server/setup.js';
import { t } from '#lib/i18n/index.js';

/** Kreator pierwszego uruchomienia. Dostępny tylko, gdy `setupDone === false` (pilnuje hooks.server.ts). */
export function load() {
	return { setup: setupData(getDb()) };
}

/** Błąd danych kroku → komunikat w kreatorze; reszta jak zwykle. */
async function guard(fn: () => unknown) {
	try {
		return { ok: true, result: await fn() };
	} catch (e) {
		if (e instanceof SetupError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(String(f.get('payload') ?? '{}'));
		} catch {
			return fail(400, { error: t('setup.err.form') });
		}
		return guard(() => saveStep(getDb(), f.get('step'), payload ?? {}));
	},
	/** Język: zapis od razu, bez przechodzenia dalej – kreator przełącza się na nowy język. */
	language: async ({ request }) => {
		const f = await request.formData();
		return guard(() => setLanguage(getDb(), f.get('language')));
	},
	go: async ({ request }) => {
		const f = await request.formData();
		return guard(() => goToStep(getDb(), f.get('to')));
	},
	finish: async () => {
		const r = await guard(() => finishSetup(getDb()));
		if ('ok' in r) redirect(303, '/');
		return r;
	}
};
