import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { removeShopping } from '#lib/server/store.js';

export const DELETE = ({ params }) => handle(null, () => removeShopping(getDb(), params.id));
