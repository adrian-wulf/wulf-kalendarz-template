import type { AdminSection } from '#lib/modules/server-types.js';
import { act } from './act.js';
import { runtimeAuth } from './auth-runtime.js';
import { changePassword, hasPin, passwordHash, pinOnDelete, removePin, setPassword, setPin, setPinOnDelete } from './security.js';
import { t } from '#lib/i18n/index.js';

/** Panel → Dostęp: PIN kiosku, „PIN przy usuwaniu”, hasło (tryb `password`) i podsumowanie trybu logowania. */

const str = (f: FormData, k: string) => String(f.get(k) ?? '');

export const security = {
	slug: 'dostep',
	get label() {
		return t('sec.admin.title');
	},
	load: (db) => {
		const cfg = runtimeAuth();
		return {
			security: {
				mode: cfg.mode,
				pin: hasPin(db),
				pinOnDelete: pinOnDelete(db),
				password: { set: !!passwordHash(db, cfg), fromEnv: !!cfg.passwordHash },
				apiToken: !!cfg.apiToken,
				proxyHeader: cfg.proxyHeader,
				trustedProxies: cfg.trustedProxies.entries,
				kioskLocal: cfg.kioskLocal
			}
		};
	},
	actions: {
		savePin: act((f, db) => setPin(db, str(f, 'pin'), str(f, 'repeat')), 'pin'),
		removePin: act((_f, db) => removePin(db), 'pin'),
		savePinOnDelete: act((f, db) => setPinOnDelete(db, f.get('pinOnDelete') === 'on'), 'pinOnDelete'),
		changePassword: act(async (f, db) => {
			const cfg = runtimeAuth();
			if (passwordHash(db, cfg)) await changePassword(db, cfg, str(f, 'current'), str(f, 'password'), str(f, 'repeat'));
			else await setPassword(db, cfg, str(f, 'password'), str(f, 'repeat'));
		}, 'password')
	}
} satisfies AdminSection;
