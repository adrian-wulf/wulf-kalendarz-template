import type { DB } from './db/index.js';
import { members } from './db/schema.js';
import type { Member } from '#lib/types.js';

/**
 * Kto korzysta z telefonu: login z `tailscale serve` albo z nagłówka reverse proxy (AUTH_MODE=proxy),
 * dopasowany do domownika po e-mailach i kalendarzach Google (ID = adres konta). W trybie hasła loginu
 * osoby nie ma – domownika wybiera się na telefonie (ciasteczko `kal_member`).
 */
export function phoneUser(db: DB, rawLogin: string | null): { login: string | null; member: Member | null } {
	const login = rawLogin?.trim().toLowerCase() || null;
	if (!login) return { login, member: null };
	const row = db
		.select()
		.from(members)
		.all()
		.find((m) => [...m.emails, ...m.calendarIds].some((e) => e.trim().toLowerCase() === login));
	return { login, member: row ? { id: row.id, name: row.name, color: row.color, avatar: row.avatar } : null };
}
