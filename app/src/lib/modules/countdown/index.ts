import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const countdownSettings = defineSettings({
	count: {
		type: 'number',
		get label() {
			return t('countdown.setting.count');
		},
		default: 3,
		min: 1,
		max: 3
	},
	birthdays: {
		type: 'boolean',
		get label() {
			return t('countdown.setting.birthdays');
		},
		get hint() {
			return t('countdown.setting.birthdaysHint');
		},
		default: true
	}
});

export default defineModule({
	id: 'countdown',
	nameKey: 'module.countdown',
	get name() {
		return t('module.countdown');
	},
	icon: '⏳',
	get description() {
		return t('module.countdown.desc');
	},
	defaultEnabled: false,
	routes: ['/api/countdown', '/telefon/odliczanie'],
	kiosk: { tile: { kind: 'countdown', weight: 0.8 } },
	phone: { path: 'odliczanie', get label() { return t('module.countdown'); } },
	admin: { slug: 'odliczanie', get label() { return t('module.countdown'); } },
	settings: countdownSettings
});
