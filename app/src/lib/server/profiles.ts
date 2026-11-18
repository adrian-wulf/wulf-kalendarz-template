import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { members } from './db/schema.js';
import { InputError } from './store.js';
import { mediaUrl, removeByUrl, saveImage } from './media.js';
import { isPhotoAvatar, normalizeBirthday } from '#lib/logic/profiles.js';
import { t } from '#lib/i18n/index.js';

/** Profil domownika w panelu: urodziny, imię do imienin, awatar (emoji albo zdjęcie). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/**
 * Pola profilu z formularza domownika. Formularz bez tych pól (np. „nowa osoba”) niczego nie zmienia.
 */
export function profileFields(f: FormData): { birthday?: string | null; nameDay?: string | null } {
	if (!f.has('birthday')) return {};
	const birthday = normalizeBirthday(str(f, 'birthday'), f.has('noYear'));
	if (birthday === undefined) throw new InputError(t('err.date'));
	const nameDay = str(f, 'nameDay');
	if (nameDay.length > 30) throw new InputError(t('err.tooLong', { label: t('p3a.members.nameDay') }));
	return { birthday, nameDay: nameDay || null };
}

const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;

/** Emoji (albo inicjały) – najwyżej dwa znaki widoczne. */
export function parseEmoji(v: string): string {
	const s = v.trim();
	if (!s || s.startsWith('/') || s.length > 16 || graphemes(s) > 2) throw new InputError(t('p3a.members.err.emoji'));
	return s;
}

function member(db: DB, id: string) {
	const m = db.select().from(members).where(eq(members.id, id)).get();
	if (!m) throw new InputError(t('err.member'));
	return m;
}

/** Zdjęcie (gdy wysłane) albo emoji; poprzednie zdjęcie znika z dysku. */
export async function saveAvatar(db: DB, f: FormData) {
	const m = member(db, str(f, 'id'));
	const photo = f.get('photo');
	let avatar: string;
	if (photo instanceof Blob && photo.size > 0) avatar = mediaUrl('avatars', await saveImage('avatars', photo, m.id));
	else avatar = parseEmoji(str(f, 'pick') || str(f, 'emoji'));
	if (avatar !== m.avatar && isPhotoAvatar(m.avatar)) removeByUrl(m.avatar);
	db.update(members).set({ avatar }).where(eq(members.id, m.id)).run();
}

export function clearAvatar(db: DB, f: FormData) {
	const m = member(db, str(f, 'id'));
	removeByUrl(m.avatar);
	db.update(members).set({ avatar: null }).where(eq(members.id, m.id)).run();
}
