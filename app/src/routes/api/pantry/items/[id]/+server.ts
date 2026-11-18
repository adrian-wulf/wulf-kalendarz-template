import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { removePantryItem } from '#lib/server/pantry.js';

export const DELETE = ({ params }) => handle(null, () => removePantryItem(getDb(), Number(params.id)));
