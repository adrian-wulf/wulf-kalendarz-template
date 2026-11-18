import { defineModule } from '../data.js';
import { defineSettings } from '../settings.js';
import { t } from '#lib/i18n/index.js';
import { getRegion, type Country } from '#lib/region.js';

/**
 * Publiczne instancje HAFAS REST (transport.rest) – ten sam format odpowiedzi (FPTF).
 * `v6.db.transport.rest` nie działa (11.2026: brak DNS, README db-rest: „not operational anymore”) –
 * dla Deutsche Bahn zostaje własna instancja db-rest jako „własny serwer”.
 */
export const HAFAS_URLS = {
	vbb: 'https://v6.vbb.transport.rest',
	bvg: 'https://v6.bvg.transport.rest'
} as const;

/** Dostawcy HAFAS (transport.rest, własny serwer) – dane tylko z Niemiec. */
const HAFAS_PROVIDERS = ['vbb', 'bvg', 'custom'];

/** Domyślne źródło dla kraju z regionu: Polska – rozkład GTFS, Niemcy – VBB (GTFS nadal do wyboru). */
export const defaultProvider = (country: Country): 'gtfs' | 'vbb' => (country === 'PL' ? 'gtfs' : 'vbb');

/** Czy źródło pasuje do kraju: poza Niemcami tylko GTFS (HAFAS z transport.rest zna tylko niemieckie przystanki). */
export const providerFits = (provider: string, country: Country) => country === 'DE' || !HAFAS_PROVIDERS.includes(provider);

export const transitSettings = defineSettings({
	provider: {
		type: 'select',
		get label() { return t('transit.setting.provider'); },
		// Domyślne zależy od kraju z regionu – nigdy nie wskazuje obcego kraju. Zapisany wybór zostaje.
		get default() { return defaultProvider(getRegion().country); },
		get options() {
			const de = getRegion().country === 'DE';
			const hafas = (label: string) => (de ? label : `${label} – ${t('transit.provider.deOnly')}`);
			const gtfs = ['gtfs', t('transit.provider.gtfs')] as const;
			const rest = [
				['vbb', hafas('VBB (Berlin–Brandenburg)')],
				['bvg', hafas('BVG (Berlin)')],
				['custom', hafas(t('transit.provider.custom'))]
			] as const;
			// Poza Niemcami GTFS na początku listy.
			return (de ? [...rest, gtfs] : [gtfs, ...rest]) as readonly (readonly [string, string])[];
		},
		get hint() { return t('transit.setting.providerHint'); }
	},
	apiUrl: { type: 'text', get label() { return t('transit.setting.apiUrl'); }, default: '', maxLength: 200, pattern: 'https?://\\S+', get hint() { return t('transit.setting.apiUrlHint'); } },
	gtfsUrl: { type: 'text', get label() { return t('transit.setting.gtfsUrl'); }, default: '', maxLength: 300, pattern: 'https?://\\S+', get hint() { return t('transit.setting.gtfsUrlHint'); } },
	results: { type: 'number', get label() { return t('transit.setting.results'); }, default: 5, min: 2, max: 8 },
	walkMinutes: { type: 'number', get label() { return t('transit.setting.walk'); }, default: 0, min: 0, max: 30, get hint() { return t('transit.setting.walkHint'); } }
});

export default defineModule({
	id: 'transit',
	nameKey: 'module.transit',
	get name() {
		return t('module.transit');
	},
	icon: '🚏',
	get description() {
		return t('module.transit.desc');
	},
	defaultEnabled: false,
	sources: [{ name: 'transit', get label() { return t('module.transit'); } }],
	kiosk: { tile: { kind: 'transit' } },
	admin: { slug: 'odjazdy', get label() { return t('module.transit'); } },
	settings: transitSettings
});
