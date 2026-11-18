import { error } from '@sveltejs/kit';
import { readMedia } from '#lib/server/media.js';
import { t } from '#lib/i18n/index.js';

/**
 * Zdjęcia z woluminu danych: wygaszacz (`/media/photos/…`, 404 przy wyłączonym module – prefiks
 * w manifeście) i awatary domowników (`/media/avatars/…`). Nazwy plików są unikalne – pamięć podręczna na stałe.
 */
export function GET({ params }) {
	const m = readMedia(params.kind, params.file);
	if (!m) error(404, t('error.notFound'));
	return new Response(new Uint8Array(m.data), {
		headers: { 'content-type': m.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }
	});
}
