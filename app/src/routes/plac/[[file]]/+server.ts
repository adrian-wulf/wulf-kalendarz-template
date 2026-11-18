import { error } from '@sveltejs/kit';
import html from '#lib/modules/playground/plac.html?raw';

/** Plac zabaw (moduł `playground`): jedna samodzielna strona HTML. `/plac` i dawny `/plac/index.html`. */
export function GET({ params }) {
	if (params.file && params.file !== 'index.html') error(404, 'Nie ma takiej strony');
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}
