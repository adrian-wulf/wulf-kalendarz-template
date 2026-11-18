import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { setPhoneHidden } from '#lib/server/calendars.js';
import { InputError } from '#lib/server/store.js';
import { t } from '#lib/i18n/index.js';

/** Telefon: kalendarze ukryte w widoku danego domownika (`{ memberId, hidden: [id…] }`) – to tylko jego widok. */
export const POST = ({ request }) =>
	handle(request, (b) => {
		if (typeof b.memberId !== 'string' || !Array.isArray(b.hidden) || !b.hidden.every((x) => typeof x === 'string')) throw new InputError(t('cal.err.unknown'));
		setPhoneHidden(getDb(), b.memberId, b.hidden as string[]);
	});
