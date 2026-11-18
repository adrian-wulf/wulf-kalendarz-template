import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { displayState } from '#lib/server/screen.js';

/** Dla agenta ekranu na kiosku: pora dnia i jasność według planu z panelu (Ekran) oraz obrót ekranu. */
export function GET() {
	return json(displayState(getDb()));
}
