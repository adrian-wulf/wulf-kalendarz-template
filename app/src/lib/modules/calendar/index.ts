import { defineModule } from '../data.js';
import { t } from '#lib/i18n/index.js';

/** Rdzeń: kalendarz rodziny (wydarzenia lokalne i Google, domownicy). Zawsze włączony. */
export default defineModule({
	id: 'calendar',
	nameKey: 'module.calendar',
	get name() {
		return t('module.calendar');
	},
	icon: '📅',
	get description() {
		return t('module.calendar.desc');
	},
	core: true,
	defaultEnabled: true,
	sources: [{ name: 'google', label: 'Google Calendar' }],
	// --- 26a: calendar layers --- najbliższe dni na telefonie z własnym wyborem kalendarzy
	phone: {
		path: 'kalendarz',
		get label() {
			return t('module.calendar');
		}
	}
});
