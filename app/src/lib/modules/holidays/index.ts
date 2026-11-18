import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'holidays',
	nameKey: 'module.holidays',
	get name() {
		return t('module.holidays');
	},
	icon: '🏖',
	get description() {
		return t('module.holidays.desc');
	},
	defaultEnabled: true,
	sources: [{ name: 'ferien', get label() { return t('module.holidays.source'); } }]
});
