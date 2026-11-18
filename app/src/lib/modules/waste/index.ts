import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'waste',
	nameKey: 'module.waste',
	get name() {
		return t('module.waste');
	},
	icon: '🗑',
	get description() {
		return t('module.waste.desc');
	},
	defaultEnabled: true,
	sources: [{ name: 'waste', get label() { return t('module.waste.source'); } }],
	admin: { slug: 'smieci', get label() { return t('module.waste'); } }
});
