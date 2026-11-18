import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';
import { defineSettings } from '../settings.js';

export const pantrySettings = defineSettings({
	expiryWarnDays: { type: 'number', get label() { return t('pantry.setting.expiryWarnDays'); }, default: 7, min: 0, max: 60 },
	freezerOldDays: { type: 'number', get label() { return t('pantry.setting.freezerOldDays'); }, default: 180, min: 7, max: 730 }
});

export default defineModule({
	id: 'pantry',
	nameKey: 'module.pantry',
	get name() {
		return t('module.pantry');
	},
	icon: '📦',
	get description() {
		return t('module.pantry.desc');
	},
	defaultEnabled: true,
	requires: ['shopping'],
	routes: ['/zapasy', '/telefon/zapasy', '/api/pantry'],
	kiosk: {
		launcher: {
			href: '/zapasy',
			get label() { return t('module.pantry'); },
			badge: (d) => (d.low || d.warn ? { text: d.low + d.warn, warn: true } : null)
		}
	},
	phone: { path: 'zapasy', get label() { return t('module.pantry'); } },
	admin: { slug: 'zapasy', get label() { return t('module.pantry'); } },
	settings: pantrySettings
});
