import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'notes',
	nameKey: 'module.notes',
	get name() {
		return t('module.notes');
	},
	icon: '📌',
	get description() {
		return t('module.notes.desc');
	},
	defaultEnabled: true,
	routes: ['/api/notes', '/telefon/kartki'],
	kiosk: { tile: { kind: 'note' } },
	phone: { path: 'kartki', get label() { return t('module.notes'); } },
	admin: { slug: 'kartki', get label() { return t('module.notes'); } }
});
