import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'snakes',
	nameKey: 'module.snakes',
	get name() {
		return t('module.snakes');
	},
	icon: '🐍',
	get description() {
		return t('module.snakes.desc');
	},
	defaultEnabled: true,
	routes: ['/weze', '/telefon/weze', '/api/snakes'],
	kiosk: {
		launcher: {
			href: '/weze',
			get label() { return t('module.snakes'); },
			badge: (d) => (d.due || d.lowFood ? { text: d.due || '!', warn: d.lowFood } : null)
		}
	},
	phone: { path: 'weze', get label() { return t('module.snakes'); } },
	admin: { slug: 'weze', get label() { return t('module.snakes'); } }
});
