import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { deleteCountdown } from '#lib/server/countdown.js';

export const DELETE = ({ params }) => handle(null, () => deleteCountdown(getDb(), { id: params.id }));
