import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'care',
	nameKey: 'module.care',
	get name() {
		return t('module.care');
	},
	icon: '🪴',
	get description() {
		return t('module.care.desc');
	},
	defaultEnabled: false,
	routes: ['/telefon/opieka', '/api/care'],
	kiosk: { tile: { kind: 'care' } },
	phone: { path: 'opieka', get label() { return t('module.care'); } },
	admin: { slug: 'opieka', get label() { return t('module.care'); } }
});
