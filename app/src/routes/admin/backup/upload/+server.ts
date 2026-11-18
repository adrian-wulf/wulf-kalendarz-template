import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { saveUploadChunk } from '#lib/server/backup/restore.js';
import { InputError } from '#lib/server/store.js';

/**
 * Wgrywanie kopii do przywrócenia w kawałkach (każdy mieści się w limicie żądania BODY_SIZE_LIMIT),
 * nagłówki: `x-upload-id` (32 znaki hex), `x-upload-offset`. Typ treści application/octet-stream –
 * przeglądarka nie wyśle go z obcej strony bez zgody CORS, a /admin i tak wymaga logowania.
 */
export async function POST({ request }) {
	if (request.headers.get('content-type') !== 'application/octet-stream') error(415);
	const id = request.headers.get('x-upload-id') ?? '';
	const offset = Number(request.headers.get('x-upload-offset'));
	try {
		const size = await saveUploadChunk(getDb(), id, offset, new Uint8Array(await request.arrayBuffer()));
		return json({ size });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
