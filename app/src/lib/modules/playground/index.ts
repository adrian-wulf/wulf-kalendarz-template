import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'playground',
	nameKey: 'module.playground',
	get name() {
		return t('module.playground');
	},
	icon: '🎮',
	get description() {
		return t('module.playground.desc');
	},
	defaultEnabled: true,
	routes: ['/plac'],
	kiosk: { launcher: { href: '/plac', get label() { return t('module.playground.launcher'); }, reload: true } }
});
