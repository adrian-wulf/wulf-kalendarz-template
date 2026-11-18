import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { mealsData, setMeal, validFrom } from '#lib/server/meals.js';
import { localParts } from '#lib/logic/dates.js';

/** Plan na 7 dni od `?from=` (domyślnie dziś) z przepisami – okno kiosku. */
export const GET = ({ url }) => handle(null, () => mealsData(getDb(), validFrom(url.searchParams.get('from'), localParts(new Date()).date)));

/** Wpis w planie: `{ date, slot, recipeId }` albo `{ date, slot, name }`; pusty – usunięcie. */
export const POST = ({ request }) => handle(request, (b) => ({ entry: setMeal(getDb(), b) }));
