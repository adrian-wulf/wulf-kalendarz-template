import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const screensaverSettings = defineSettings({
	idleMinutes: {
		type: 'number',
		get label() {
			return t('p3a.saver.idleMinutes');
		},
		default: 5,
		min: 1,
		max: 120
	},
	slideSeconds: {
		type: 'number',
		get label() {
			return t('p3a.saver.slideSeconds');
		},
		default: 12,
		min: 5,
		max: 300
	},
	clock: {
		type: 'boolean',
		get label() {
			return t('p3a.saver.clock');
		},
		default: true
	}
});

/** Pokaz zdjęć rodzinnych po kilku minutach bez dotyku; dotknięcie wraca do kalendarza, w nocy nie działa. */
export default defineModule({
	id: 'screensaver',
	nameKey: 'module.screensaver',
	get name() {
		return t('module.screensaver');
	},
	icon: '🖼',
	get description() {
		return t('module.screensaver.desc');
	},
	defaultEnabled: false,
	routes: ['/media/photos'],
	admin: {
		slug: 'wygaszacz',
		get label() {
			return t('module.screensaver');
		}
	},
	settings: screensaverSettings
});
