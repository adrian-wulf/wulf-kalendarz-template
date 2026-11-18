import { asc } from 'drizzle-orm';
import { members } from '#lib/server/db/schema.js';
import { getSetting } from '#lib/server/sync.js';
import { birthdaysBetween, upcomingBirthdays } from '#lib/logic/profiles.js';
import { celebratesNameDay, namedaysOn } from '#lib/logic/namedays.js';
import { addDays } from '#lib/logic/dates.js';
import { possessive } from '#lib/logic/profiles.js';
import { getLang, t, tn } from '#lib/i18n/index.js';
import type { CalEvent } from '#lib/types.js';
import { moduleConfig } from '../index.js';
import { defineServer } from '../server-types.js';
import { birthdaysSettings } from './index.js';

export default defineServer('birthdays', {
	dashboard: ({ db, today, until, modules }) => {
		const { countdownDays, namedays } = moduleConfig(birthdaysSettings, modules, 'birthdays');
		const list = db.select().from(members).orderBy(asc(members.sortOrder)).all();
		const lang = getLang();
		// Urodziny jako wydarzenia całodniowe (od wczoraj – jak reszta zakresu ekranu).
		const events: CalEvent[] = list.flatMap((m) =>
			birthdaysBetween(m.birthday, addDays(today, -1), until).map(({ date, age }) => ({
				id: `birthday:${m.id}:${date}`,
				title: t('p3a.birthdays.title', { who: possessive(m.name, lang) }) + (age ? ` · ${tn('p3a.birthdays.age', age)}` : ''),
				start: date,
				end: addDays(date, 1),
				allDay: true,
				memberId: m.id,
				kind: 'birthday' as const
			}))
		);
		// Imieniny tylko w Polsce: lista na dziś i domownicy, którzy świętują (imię do imienin albo imię).
		const names = namedays && getSetting(db, 'region').country === 'PL' ? namedaysOn(today) : null;
		return {
			events,
			data: {
				upcoming: upcomingBirthdays(list, today, countdownDays),
				namedays: names ? { names: [...names], members: list.filter((m) => celebratesNameDay(m.nameDay || m.name, names)).map((m) => m.id) } : null
			}
		};
	}
});
