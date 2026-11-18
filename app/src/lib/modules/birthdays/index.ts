import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const birthdaysSettings = defineSettings({
	countdownDays: {
		type: 'number',
		get label() {
			return t('p3a.birthdays.countdownDays');
		},
		get hint() {
			return t('p3a.birthdays.countdownHint');
		},
		default: 14,
		min: 0,
		max: 60
	},
	namedays: {
		type: 'boolean',
		get label() {
			return t('p3a.namedays.setting');
		},
		get hint() {
			return t('p3a.namedays.settingHint');
		},
		default: true
	}
});

/** Urodziny domowników (z panelu → Domownicy) jako wydarzenia i odliczanie; imieniny w Polsce. */
export default defineModule({
	id: 'birthdays',
	nameKey: 'module.birthdays',
	get name() {
		return t('module.birthdays');
	},
	icon: '🎂',
	get description() {
		return t('module.birthdays.desc');
	},
	defaultEnabled: true,
	settings: birthdaysSettings
});
