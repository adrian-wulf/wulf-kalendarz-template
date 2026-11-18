import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'weather',
	nameKey: 'module.weather',
	get name() {
		return t('module.weather');
	},
	icon: '🌤',
	get description() {
		return t('module.weather.desc');
	},
	defaultEnabled: true,
	sources: [{ name: 'weather', get label() { return t('module.weather.source'); } }]
});
