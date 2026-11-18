import { DEFAULT_TZ, setTimeZone } from './logic/dates';
import { t } from './i18n/index.js';

/** Region rodziny: kraj, land / województwo i strefa czasowa. Wspólne dla serwera i przeglądarki. */
export type Country = 'DE' | 'PL';

export interface Region {
	country: Country;
	/** Kod jednostki jak w OpenHolidays API, np. 'DE-NI', 'PL-MZ'. */
	subdivision: string;
	/** Strefa IANA, np. 'Europe/Berlin'. */
	timezone: string;
}

export const DEFAULT_REGION: Region = { country: 'DE', subdivision: 'DE-NI', timezone: DEFAULT_TZ };

export const COUNTRIES: { code: Country; name: string; timezone: string }[] = [
	{
		code: 'DE',
		get name() {
			return t('region.DE');
		},
		timezone: 'Europe/Berlin'
	},
	{
		code: 'PL',
		get name() {
			return t('region.PL');
		},
		timezone: 'Europe/Warsaw'
	}
];

const DE_CODES = ['DE-BW', 'DE-BY', 'DE-BE', 'DE-BB', 'DE-HB', 'DE-HH', 'DE-HE', 'DE-MV', 'DE-NI', 'DE-NW', 'DE-RP', 'DE-SL', 'DE-SN', 'DE-ST', 'DE-SH', 'DE-TH'] as const;
const PL_CODES = ['PL-DS', 'PL-KP', 'PL-LB', 'PL-LU', 'PL-LD', 'PL-MA', 'PL-MZ', 'PL-OP', 'PL-PD', 'PL-PK', 'PL-PM', 'PL-SK', 'PL-SL', 'PL-WN', 'PL-WP', 'PL-ZP'] as const;

/** Nazwa w bieżącym języku (getter – liczona przy odczycie, także po zmianie języka). */
const named = (code: (typeof DE_CODES)[number] | (typeof PL_CODES)[number]) => ({
	code,
	get name() {
		return t(`region.${code}`);
	}
});

/**
 * Landy i województwa. Kody PL są takie, jakich używa OpenHolidays API – to stare literowe kody
 * ISO 3166-2 z tą różnicą, że API zamienia pary LB/LU, PD/PK i SK/SL (sprawdzone 11.2026 na /Subdivisions).
 */
export const SUBDIVISIONS: Record<Country, { code: string; name: string }[]> = {
	DE: DE_CODES.map(named),
	PL: PL_CODES.map(named)
};

export const isCountry = (c: string): c is Country => c === 'DE' || c === 'PL';

let current: Region = DEFAULT_REGION;

export const getRegion = () => current;

/** Ustawia region (i strefę czasową dla wszystkich obliczeń dat). */
export function setRegion(r: Region) {
	setTimeZone(r.timezone);
	current = r;
}
