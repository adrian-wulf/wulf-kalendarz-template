import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const medsSettings = defineSettings({
	lead: { type: 'number', get label() { return t('meds.setting.lead'); }, default: 30, min: 0, max: 180 },
	grace: { type: 'number', get label() { return t('meds.setting.grace'); }, default: 60, min: 5, max: 480 }
});

export default defineModule({
	id: 'meds',
	nameKey: 'module.meds',
	get name() {
		return t('module.meds');
	},
	icon: '💊',
	get description() {
		return t('module.meds.desc');
	},
	defaultEnabled: false,
	routes: ['/telefon/leki', '/api/meds'],
	kiosk: { tile: { kind: 'meds' } },
	phone: { path: 'leki', get label() { return t('module.meds'); } },
	admin: { slug: 'leki', get label() { return t('module.meds'); } },
	settings: medsSettings
});
