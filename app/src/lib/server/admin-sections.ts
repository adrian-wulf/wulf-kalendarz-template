import type { AdminSection } from '#lib/modules/server-types.js';
import { act } from './act.js';
import * as A from './admin.js';
import * as T from './theme.js';
import * as L from './layout.js';
import { disconnect, getClient, getRoles, isConnected, listCalendars, googleRedirectUri, type GCalendar } from './google.js';
import { getSetting, refreshNow, wasteRules, activeSources } from './sync.js';
import { MEMBER_PALETTE } from '#lib/colors.js';
import { COUNTRIES, SUBDIVISIONS } from '#lib/region.js';
import { bins } from '#lib/logic/waste.js';
import { isActive } from '#lib/modules/registry.server.js';
import { getLang, t } from '#lib/i18n/index.js';
import { setLanguage } from './setup.js';
import { getScreen, saveScreen } from './screen.js';
import * as P from './profiles.js';
// --- p4: backups ---
import { backups } from './backup-admin.js';
// --- p4: security ---
import { security } from './security-section.js';
// --- 26a: calendar layers ---
import { calendarsSection } from './calendars-section.js';
import { rememberGoogleNames } from './calendars.js';

/** Sekcje panelu niezależne od modułów (rdzeń). Kolejność = kolejność w menu. */

const defineSection = <S extends AdminSection>(s: S) => s;

export const google = defineSection({
	slug: 'google',
	label: 'Google',
	load: async (db, { url }) => {
		const connected = isConnected(db);
		let calendars: GCalendar[] = [];
		let calendarsError: string | null = null;
		if (connected) {
			try {
				calendars = await listCalendars(db);
				rememberGoogleNames(db, calendars);
			} catch (e) {
				calendarsError = e instanceof Error ? e.message : String(e);
			}
		}
		return {
			google: {
				clientId: getClient(db)?.id ?? null,
				connected,
				calendars,
				calendarsError,
				roles: getRoles(db),
				redirectUri: googleRedirectUri(url.origin),
				error: url.searchParams.get('google_error'),
				justConnected: url.searchParams.get('google') === 'ok'
			}
		};
	},
	actions: {
		saveGoogleClient: act((f, db) => A.saveGoogleClient(db, f), 'google'),
		saveGoogleCalendars: act(async (f, db) => {
			A.saveGoogleCalendars(db, f);
			await refreshNow(db, 'google');
		}, 'google'),
		disconnectGoogle: act((_, db) => disconnect(db), 'google')
	}
});

export const members = defineSection({
	slug: 'domownicy',
	get label() {
		return t('admin.section.members');
	},
	load: (db) => ({
		palette: [...MEMBER_PALETTE],
		// Kolory pojemników są zarezerwowane – tylko gdy moduł Śmieci działa.
		bins: isActive(db, 'waste') ? bins(wasteRules(db)).map(({ bin, label, color }) => ({ bin, label, color })) : []
	}),
	actions: {
		saveMember: act((f, db) => A.saveMember(db, f), 'members'),
		moveMember: act((f, db) => A.moveMember(db, f), 'members'),
		deleteMember: act((f, db) => A.deleteMember(db, f), 'members'),
		saveAvatar: act((f, db) => P.saveAvatar(db, f), 'members'),
		clearAvatar: act((f, db) => P.clearAvatar(db, f), 'members')
	}
});

export const events = defineSection({
	slug: 'wydarzenia',
	get label() {
		return t('admin.section.events');
	},
	// Lokalne wydarzenia to zapas na czas bez Google – po podłączeniu znikają z menu.
	hidden: (db) => isConnected(db),
	load: (db, { today }) => ({ events: A.listEvents(db, today), googleConnected: isConnected(db) }),
	actions: {
		saveEvent: act((f, db) => A.saveEvent(db, f), 'events'),
		deleteEvent: act((f, db) => A.deleteEvent(db, f), 'events')
	}
});

export const region = defineSection({
	slug: 'region',
	get label() {
		return t('setup.step.region');
	},
	load: (db) => ({
		region: getSetting(db, 'region'),
		countries: COUNTRIES,
		subdivisions: SUBDIVISIONS,
		timezones: Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('Europe/'))
	}),
	actions: {
		saveRegion: act((f, db) => {
			A.saveRegion(db, f);
			// Ferie i pogoda z sieci odświeżają się w tle – zapis nie czeka na API.
			void Promise.all(['ferien', 'weather', 'waste'].map((n) => refreshNow(db, n)));
		}, 'region')
	}
});

export const theme = defineSection({
	slug: 'wyglad',
	get label() {
		return t('admin.section.theme');
	},
	load: (db) => ({ theme: T.getTheme(db) }),
	actions: {
		saveTheme: act((f, db) => T.saveTheme(db, f), 'theme'),
		resetTheme: act((_, db) => T.resetTheme(db), 'theme')
	}
});

export const layout = defineSection({
	slug: 'uklad',
	get label() {
		return t('layout.title');
	},
	load: (db) => ({ layout: L.getLayout(db) }),
	actions: {
		saveLayout: act((f, db) => L.saveLayout(db, f), 'layout')
	}
});

export const settings = defineSection({
	slug: 'ustawienia',
	get label() {
		return t('admin.section.settings');
	},
	load: (db) => ({
		settings: {
			location: getSetting(db, 'location'),
			wasteIcalUrl: getSetting(db, 'wasteIcalUrl')
		},
		language: getLang(),
		weather: isActive(db, 'weather'),
		waste: isActive(db, 'waste')
	}),
	actions: {
		saveLanguage: act((f, db) => setLanguage(db, f.get('language')), 'language'),
		saveSettings: act(async (f, db) => {
			A.saveSettings(db, f);
			await Promise.all(activeSources(db).map((s) => refreshNow(db, s.name)));
		}, 'settings')
	}
});

export const screen = defineSection({
	slug: 'ekran',
	get label() {
		return t('p3a.screen.title');
	},
	load: (db) => ({ screen: getScreen(db) }),
	actions: {
		saveScreen: act((f, db) => saveScreen(db, f), 'screen')
	}
});

/** Sekcje rdzenia w kolejności menu: przed sekcjami modułów (google, domownicy, wydarzenia) i po nich (reszta). */
export const CORE_BEFORE: AdminSection[] = [calendarsSection, google, members, events];
export const CORE_AFTER: AdminSection[] = [region, theme, layout, settings, screen, backups, security];
