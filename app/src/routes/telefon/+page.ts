import { redirect } from '@sveltejs/kit';
import { phoneTabs } from '#lib/modules/index.js';

/** Start: pierwsza zakładka aktywnych modułów; bez żadnej – pusta strona z informacją. */
export async function load({ parent }) {
	const { enabled } = await parent();
	const first = phoneTabs(enabled)[0];
	if (first) redirect(307, `/telefon/${first.phone!.path}`);
}
