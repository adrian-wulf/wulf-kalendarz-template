import { asc, eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { countdowns } from './db/schema.js';
import { bool, date, emoji, member, need, optId, type Input } from './fields.js';
import { getSetting } from './sync.js';
import { birthdayCountdowns, upcoming, withoutDuplicateBirthdays, type CountdownDef } from '#lib/logic/countdown.js';
import { possessive } from '#lib/logic/profiles.js';
import { addDays } from '#lib/logic/dates.js';
import { moduleConfig } from '#lib/modules/index.js';
import { countdownSettings } from '#lib/modules/countdown/index.js';
import type { CountdownTile } from '#lib/modules/p3b-data.js';
import { listMembers } from './admin.js';
import { getLang, t } from '#lib/i18n/index.js';

/** Odliczanie do wybranych dat; opcjonalnie urodziny domowników. */

export const countdownConfig = (db: DB) => moduleConfig(countdownSettings, getSetting(db, 'modules'), 'countdown');

export const listCountdowns = (db: DB) => db.select().from(countdowns).orderBy(asc(countdowns.date)).all();

/** Urodziny z profili domowników (moduł „Urodziny i imieniny”, panel → Domownicy) – „Urodziny Oli”. */
function birthdaySource(db: DB): CountdownDef[] {
	const lang = getLang();
	return birthdayCountdowns(listMembers(db), (name) => t('p3a.birthdays.title', { who: possessive(name, lang) }));
}

/** Nadchodzące odliczania (własne + urodziny, jeśli włączone), najbliższe najpierw. */
export function countdownItems(db: DB, today: string, limit = 30) {
	const cfg = countdownConfig(db);
	const own: CountdownDef[] = listCountdowns(db);
	return upcoming([...own, ...(cfg.birthdays ? withoutDuplicateBirthdays(own, birthdaySource(db)) : [])], today, limit);
}

export function countdownTile(db: DB, today: string): CountdownTile {
	return {
		show: countdownConfig(db).count,
		items: countdownItems(db, today).map(({ id, title, emoji: e, next, days, memberId }) => ({ id, title, emoji: e, next, days, memberId }))
	};
}

export function saveCountdown(db: DB, input: Input) {
	const id = optId(input, 'id');
	const row = {
		title: need(input, 'title', t('countdown.what'), 60),
		emoji: emoji(input, 'emoji', '🎉'),
		date: date(input, 'date'),
		yearly: bool(input, 'yearly'),
		memberId: member(db, input, 'memberId', false)
	};
	if (id) return db.update(countdowns).set(row).where(eq(countdowns.id, id)).returning().get();
	return db.insert(countdowns).values(row).returning().get();
}

export const deleteCountdown = (db: DB, input: Input) => {
	const id = optId(input, 'id');
	if (id) db.delete(countdowns).where(eq(countdowns.id, id)).run();
};

/** Przykład: Wigilia (co roku), wakacje za kilka tygodni, urodziny Oli za 9 dni (gdy jest wśród domowników). */
export function seedCountdowns(db: DB, today: string) {
	if (listCountdowns(db).length) return;
	const y = Number(today.slice(0, 4));
	const ola = listMembers(db).some((m) => m.id === 'ola');
	db.insert(countdowns)
		.values([
			{ title: t('demo.countdown.xmas'), emoji: '🎄', date: `${y}-12-24`, yearly: true },
			{ title: t('demo.countdown.trip'), emoji: '🏖️', date: addDays(today, 47), yearly: false },
			...(ola ? [{ title: t('p3a.birthdays.title', { who: possessive('Ola', getLang()) }), emoji: '🎂', date: `2018-${addDays(today, 9).slice(5)}`, yearly: true, memberId: 'ola' }] : [])
		])
		.run();
}
