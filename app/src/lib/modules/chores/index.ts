import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

export default defineModule({
	id: 'chores',
	nameKey: 'module.chores',
	get name() {
		return t('module.chores');
	},
	icon: '✅',
	get description() {
		return t('module.chores.desc');
	},
	defaultEnabled: true,
	routes: ['/api/chores', '/telefon/zadania'],
	kiosk: { tile: { kind: 'chore' } },
	phone: { path: 'zadania', get label() { return t('module.chores'); } },
	admin: { slug: 'zadania', get label() { return t('module.chores'); } }
});
