/**
 * PIN na kiosku (strona przeglądarki): kiedy pytać i otwarcie klawiatury PIN (`PinPad` w +layout).
 * Serwer i tak sprawdza zgodę (ciasteczko po PIN-ie) – to tylko wygoda: bez PIN-u nie ma pytania,
 * a po dobrym PIN-ie kolejne usunięcia przez chwilę nie pytają znowu.
 */
export type PinReason = 'settings' | 'delete' | 'approve' | 'layers';

export const pinPad = $state<{ open: boolean; reason: PinReason }>({ open: false, reason: 'settings' });

let config = { set: false, onDelete: false };
let grantUntil = 0;
let resolver: ((ok: boolean) => void) | null = null;

/** Z danych +layout (`kioskPin`); null = to nie kiosk. */
export function configurePin(c: { set: boolean; onDelete: boolean } | null) {
	config = c ?? { set: false, onDelete: false };
}

/** Czy PIN jest ustawiony (bez PIN-u kiosk nie zatwierdza nagród). */
export const pinIsSet = () => config.set;

/**
 * Pyta o PIN, gdy trzeba: usuwanie – gdy w panelu włączono „PIN przy usuwaniu”; ustawienia – gdy PIN jest
 * ustawiony; zgoda na nagrodę – zawsze (bez PIN-u: false). Zwraca, czy można działać.
 */
export function needPin(reason: PinReason): Promise<boolean> {
	if (reason === 'delete' && !(config.set && config.onDelete)) return Promise.resolve(true);
	if (reason === 'settings' && !config.set) return Promise.resolve(true);
	if (reason === 'approve' && !config.set) return Promise.resolve(false);
	// Kalendarze zablokowane w panelu: bez PIN-u nie da się ich przełączać na kiosku.
	if (reason === 'layers' && !config.set) return Promise.resolve(false);
	if (Date.now() < grantUntil) return Promise.resolve(true);
	resolver?.(false);
	pinPad.reason = reason;
	pinPad.open = true;
	return new Promise((r) => (resolver = r));
}

/** Wynik z klawiatury: `ttlMs` – ważność zgody z serwera. */
export function pinDone(ok: boolean, ttlMs = 0) {
	// Zapas 15 s: usunięcie wysyła się dopiero po 5 s na „Cofnij”.
	if (ok) grantUntil = Date.now() + Math.max(0, ttlMs - 15_000);
	pinPad.open = false;
	const r = resolver;
	resolver = null;
	r?.(ok);
}

/** Zamknięcie ustawień: zgoda wygasa od razu (też na serwerze). */
export function lockPin() {
	grantUntil = 0;
	void fetch('/api/kiosk/pin', { method: 'DELETE', headers: { 'content-type': 'application/json' } }).catch(() => {});
}
