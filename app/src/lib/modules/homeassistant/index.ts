import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const haSettings = defineSettings({
	refreshSeconds: { type: 'number', get label() { return t('ha.setting.refresh'); }, default: 15, min: 5, max: 600 },
	cameraSeconds: { type: 'number', get label() { return t('ha.setting.camera'); }, default: 10, min: 2, max: 600 },
	allowToggle: { type: 'boolean', get label() { return t('ha.setting.toggle'); }, default: true, get hint() { return t('ha.setting.toggleHint'); } }
});

export default defineModule({
	id: 'homeassistant',
	nameKey: 'module.homeassistant',
	get name() {
		return t('module.homeassistant');
	},
	icon: '🏠',
	get description() {
		return t('module.homeassistant.desc');
	},
	defaultEnabled: false,
	routes: ['/api/homeassistant'],
	sources: [{ name: 'homeassistant', label: 'Home Assistant' }],
	kiosk: { tile: { kind: 'ha', weight: 1.2 } },
	admin: { slug: 'home-assistant', get label() { return 'Home Assistant'; } },
	settings: haSettings
});
