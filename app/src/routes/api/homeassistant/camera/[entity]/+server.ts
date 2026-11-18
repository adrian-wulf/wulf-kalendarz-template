import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { InputError } from '#lib/server/store.js';
import { cameraSnapshot, HaError } from '#lib/server/homeassistant.js';

/** Obraz z kamery przez serwer (HA `camera_proxy` z tokenem) – tylko kamery wybrane w panelu. */
export async function GET({ params }) {
	try {
		const { body, type } = await cameraSnapshot(getDb(), params.entity);
		return new Response(body, { headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
	} catch (e) {
		if (e instanceof InputError) error(404, e.message);
		if (e instanceof HaError) error(502, e.message);
		throw e;
	}
}
