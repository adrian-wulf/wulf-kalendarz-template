import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'shopping',
	nameKey: 'module.shopping',
	get name() {
		return t('module.shopping');
	},
	icon: '🛒',
	get description() {
		return t('module.shopping.desc');
	},
	defaultEnabled: true,
	routes: ['/api/shopping'],
	sources: [{ name: 'bring', get label() { return t('module.shopping.source'); } }],
	kiosk: { tile: { kind: 'shopping', weight: 1.2 } },
	admin: { slug: 'zakupy', get label() { return t('module.shopping.admin'); } }
});
