import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { removeSnakeEvent } from '#lib/server/snakes.js';

export const DELETE = ({ params }) => handle(null, () => removeSnakeEvent(getDb(), Number(params.id)));
