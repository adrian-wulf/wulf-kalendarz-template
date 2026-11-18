import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '#lib/server/security.js';

/**
 * Wylogowanie (POST z formularza – SvelteKit sprawdza Origin). Sesja jest bezstanowa: usuwamy ciasteczko;
 * unieważnienie wszystkich sesji naraz = zmiana hasła w panelu.
 */
export function POST({ cookies }) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
}
