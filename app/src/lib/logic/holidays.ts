import { addDays, isoWeekday } from './dates';
import { getRegion, type Region } from '#lib/region.js';
import { getLang, type Lang } from '#lib/i18n/index.js';

export type { Lang };

/**
 * Ustawowe dni wolne w Polsce i we wszystkich landach Niemiec – liczone lokalnie, bez sieci i bez
 * zależności (działa też w przeglądarce kiosku). Tylko święta obowiązujące w całym landzie:
 * Boże Ciało w części Saksonii/Turyngii, 15.08 w katolickich gminach Bawarii i Augsburger
 * Friedensfest nie są uwzględniane.
 */


export interface Holiday {
	date: string;
	name: string;
}

/** Niedziela wielkanocna (algorytm Meeusa/Jonesa/Butchera). */
export function easterSunday(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const NAMES = {
	newYear: { pl: 'Nowy Rok', de: 'Neujahr', en: "New Year's Day" },
	epiphany: { pl: 'Święto Trzech Króli', de: 'Heilige Drei Könige', en: 'Epiphany' },
	womensDay: { pl: 'Dzień Kobiet', de: 'Internationaler Frauentag', en: "International Women's Day" },
	goodFriday: { pl: 'Wielki Piątek', de: 'Karfreitag', en: 'Good Friday' },
	easter: { pl: 'Wielkanoc', de: 'Ostersonntag', en: 'Easter Sunday' },
	easterMonday: { pl: 'Poniedziałek Wielkanocny', de: 'Ostermontag', en: 'Easter Monday' },
	labour: { pl: 'Święto Pracy', de: 'Tag der Arbeit', en: 'Labour Day' },
	liberation: { pl: 'Dzień Wyzwolenia', de: 'Tag der Befreiung', en: 'Liberation Day' },
	uprising: { pl: 'Rocznica powstania w NRD', de: 'Jahrestag des Volksaufstands in der DDR', en: 'Anniversary of the 1953 GDR Uprising' },
	constitution: { pl: 'Święto Konstytucji 3 Maja', de: 'Tag der Verfassung vom 3. Mai', en: 'Constitution Day' },
	ascension: { pl: 'Wniebowstąpienie', de: 'Christi Himmelfahrt', en: 'Ascension Day' },
	pentecost: { pl: 'Zielone Świątki', de: 'Pfingstsonntag', en: 'Whit Sunday' },
	whitMonday: { pl: 'Zielone Świątki (pon.)', de: 'Pfingstmontag', en: 'Whit Monday' },
	corpusChristi: { pl: 'Boże Ciało', de: 'Fronleichnam', en: 'Corpus Christi' },
	assumption: { pl: 'Wniebowzięcie NMP', de: 'Mariä Himmelfahrt', en: 'Assumption Day' },
	childrensDay: { pl: 'Dzień Dziecka', de: 'Weltkindertag', en: "World Children's Day" },
	germanUnity: { pl: 'Dzień Jedności Niemiec', de: 'Tag der Deutschen Einheit', en: 'Day of German Unity' },
	reformation: { pl: 'Święto Reformacji', de: 'Reformationstag', en: 'Reformation Day' },
	allSaints: { pl: 'Wszystkich Świętych', de: 'Allerheiligen', en: "All Saints' Day" },
	independence: { pl: 'Święto Niepodległości', de: 'Unabhängigkeitstag', en: 'Independence Day' },
	repentance: { pl: 'Dzień Pokuty i Modlitwy', de: 'Buß- und Bettag', en: 'Day of Repentance and Prayer' },
	christmasEve: { pl: 'Wigilia', de: 'Heiligabend', en: 'Christmas Eve' },
	christmas: { pl: 'Boże Narodzenie', de: '1. Weihnachtstag', en: 'Christmas Day' },
	christmas2: { pl: 'Boże Narodzenie (2. dzień)', de: '2. Weihnachtstag', en: 'Boxing Day' }
} satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof NAMES;

/** Środa przed 23 listopada (Buß- und Bettag). */
function repentanceDay(year: number): string {
	let d = `${year}-11-22`;
	while (isoWeekday(d) !== 3) d = addDays(d, -1);
	return d;
}

function rules(year: number, country: Region['country'], sub: string): [string, Key][] {
	const e = easterSunday(year);
	const md = (s: string) => `${year}-${s}`;
	const inSub = (...codes: string[]) => codes.some((c) => sub === `DE-${c}`);

	if (country === 'PL') {
		const list: [string, Key][] = [
			[md('01-01'), 'newYear'],
			[md('01-06'), 'epiphany'], // od 2011
			[e, 'easter'],
			[addDays(e, 1), 'easterMonday'],
			[md('05-01'), 'labour'],
			[md('05-03'), 'constitution'],
			[addDays(e, 49), 'pentecost'],
			[addDays(e, 60), 'corpusChristi'],
			[md('08-15'), 'assumption'],
			[md('11-01'), 'allSaints'],
			[md('11-11'), 'independence'],
			[md('12-25'), 'christmas'],
			[md('12-26'), 'christmas2']
		];
		if (year < 2011) list.splice(1, 1);
		if (year >= 2025) list.push([md('12-24'), 'christmasEve']); // ustawa z 6.12.2024
		return list;
	}

	const list: [string, Key][] = [
		[md('01-01'), 'newYear'],
		[addDays(e, -2), 'goodFriday'],
		[addDays(e, 1), 'easterMonday'],
		[md('05-01'), 'labour'],
		[addDays(e, 39), 'ascension'],
		[addDays(e, 50), 'whitMonday'],
		[md('10-03'), 'germanUnity'],
		[md('12-25'), 'christmas'],
		[md('12-26'), 'christmas2']
	];
	if (inSub('BW', 'BY', 'ST')) list.push([md('01-06'), 'epiphany']);
	if ((inSub('BE') && year >= 2019) || (inSub('MV') && year >= 2023)) list.push([md('03-08'), 'womensDay']);
	if (inSub('BE') && (year === 2020 || year === 2025)) list.push([md('05-08'), 'liberation']);
	if (inSub('BE') && year === 2028) list.push([md('06-17'), 'uprising']);
	if (inSub('BB')) list.push([e, 'easter'], [addDays(e, 49), 'pentecost']);
	if (inSub('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) list.push([addDays(e, 60), 'corpusChristi']);
	if (inSub('SL')) list.push([md('08-15'), 'assumption']);
	if (inSub('TH') && year >= 2019) list.push([md('09-20'), 'childrensDay']);
	if (
		year === 2017 ||
		inSub('BB', 'MV', 'SN', 'ST', 'TH') ||
		(inSub('HB', 'HH', 'NI', 'SH') && year >= 2018)
	)
		list.push([md('10-31'), 'reformation']);
	if (inSub('BW', 'BY', 'NW', 'RP', 'SL')) list.push([md('11-01'), 'allSaints']);
	if (inSub('SN')) list.push([repentanceDay(year), 'repentance']);
	return list;
}

const memo = new Map<string, Holiday[]>();

/** Ustawowe dni wolne w roku dla regionu (domyślnie z ustawień), nazwy w języku `lang`. */
export function publicHolidays(year: number, region: Pick<Region, 'country' | 'subdivision'> = getRegion(), lang: Lang = getLang()): Holiday[] {
	const key = `${year}|${region.country}|${region.subdivision}|${lang}`;
	let list = memo.get(key);
	if (!list) {
		list = rules(year, region.country, region.subdivision)
			.map(([date, k]) => ({ date, name: NAMES[k][lang] }))
			.sort((x, y) => x.date.localeCompare(y.date));
		memo.set(key, list);
	}
	return list;
}

export function holidayOn(date: string, region: Pick<Region, 'country' | 'subdivision'> = getRegion(), lang: Lang = getLang()): Holiday | undefined {
	return publicHolidays(Number(date.slice(0, 4)), region, lang).find((h) => h.date === date);
}
