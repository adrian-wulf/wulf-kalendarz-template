import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { completeTask, InputError } from '#lib/server/store.js';

export const POST = ({ request }) =>
	handle(request, (b) => {
		if (typeof b.key !== 'string') throw new InputError('Brak klucza');
		completeTask(getDb(), b.key);
	});
