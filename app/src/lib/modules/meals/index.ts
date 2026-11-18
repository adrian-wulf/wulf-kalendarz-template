import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';

export const mealsSettings = defineSettings({
	slots: {
		type: 'select',
		get label() {
			return t('meals.setting.slots');
		},
		default: 'lunch',
		get options() {
			return [
				['lunch', t('meals.slot.lunch')],
				['dinner', t('meals.slot.dinner')],
				['both', t('meals.slot.both')]
			] as const;
		}
	},
	shoppingDays: {
		type: 'number',
		get label() {
			return t('meals.setting.shoppingDays');
		},
		default: 7,
		min: 1,
		max: 14
	},
	usePantry: {
		type: 'boolean',
		get label() {
			return t('meals.setting.usePantry');
		},
		get hint() {
			return t('meals.setting.usePantryHint');
		},
		default: true
	}
});

export default defineModule({
	id: 'meals',
	nameKey: 'module.meals',
	get name() {
		return t('module.meals');
	},
	icon: '🍽️',
	get description() {
		return t('module.meals.desc');
	},
	defaultEnabled: false,
	// Brakujące składniki trafiają na listę zakupów; zapasy są opcjonalne (odejmują to, co jest w domu).
	requires: ['shopping'],
	routes: ['/api/meals', '/telefon/posilki'],
	kiosk: { tile: { kind: 'meal' } },
	phone: { path: 'posilki', get label() { return t('module.meals'); } },
	admin: { slug: 'posilki', get label() { return t('module.meals'); } },
	settings: mealsSettings
});
