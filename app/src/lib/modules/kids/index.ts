import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const kidsSettings = defineSettings({
	celebrate: {
		type: 'boolean',
		get label() {
			return t('kids.setting.celebrate');
		},
		get hint() {
			return t('kids.setting.celebrateHint');
		},
		default: true
	}
});

export default defineModule({
	id: 'kids',
	nameKey: 'module.kids',
	get name() {
		return t('module.kids');
	},
	icon: '⭐',
	get description() {
		return t('module.kids.desc');
	},
	defaultEnabled: false,
	routes: ['/api/kids', '/telefon/dzieci'],
	kiosk: { tile: { kind: 'kids' } },
	phone: { path: 'dzieci', get label() { return t('module.kids'); } },
	admin: { slug: 'dzieci', get label() { return t('module.kids'); } },
	settings: kidsSettings
});
