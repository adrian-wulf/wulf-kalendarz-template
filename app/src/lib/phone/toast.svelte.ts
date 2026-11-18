import { t } from '#lib/i18n/index.js';

/** Komunikat na dole ekranu telefonu, opcjonalnie z „Cofnij”. */
export const toast = $state<{ text: string; error?: boolean; undo?: () => void; id: number }>({ text: '', id: 0 });

let timer: ReturnType<typeof setTimeout>;

export function say(text: string, opts: { error?: boolean; undo?: () => void; ms?: number } = {}) {
	clearTimeout(timer);
	Object.assign(toast, { text, error: opts.error, undo: opts.undo, id: toast.id + 1 });
	timer = setTimeout(() => (toast.text = ''), opts.ms ?? 5000);
}

export function hideToast() {
	clearTimeout(timer);
	toast.text = '';
}

/** Usunięcie z cofnięciem: element znika od razu (`hidden` – reaktywny SvelteSet), zapis po 5 s. */
export function deferred(hidden: Set<string>, key: string, label: string, run: () => Promise<void>) {
	hidden.add(key);
	const job = setTimeout(async () => {
		try {
			await run();
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		hidden.delete(key);
	}, 5000);
	say(label, {
		undo: () => {
			clearTimeout(job);
			hidden.delete(key);
			hideToast();
		}
	});
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Żądanie do API kiosku; błąd serwera → wyjątek z komunikatem w języku interfejsu. */
export async function api<T = unknown>(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> {
	const r = await fetch(url, { method, headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
	if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? t('common.httpError', { status: r.status }));
	return r.json() as Promise<T>;
}
