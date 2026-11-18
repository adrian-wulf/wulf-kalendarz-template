import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { removeNote } from '#lib/server/store.js';

export const DELETE = ({ params }) => handle(null, () => removeNote(getDb(), params.id));
