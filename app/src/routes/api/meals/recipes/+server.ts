import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { saveRecipe } from '#lib/server/meals.js';

/** Nowy albo zmieniony przepis (telefon): `{ id?, name, emoji, ingredients, notes }`. */
export const POST = ({ request }) => handle(request, (b) => saveRecipe(getDb(), b));
