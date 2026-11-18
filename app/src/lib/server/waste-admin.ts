import type { DB } from './db/index.js';
import { InputError } from './store.js';
import { getSetting, setSetting, wasteRules } from './sync.js';
import { bins } from '#lib/logic/waste.js';
import { parseDateList, seriesDates } from '#lib/logic/waste-dates.js';
import { t } from '#lib/i18n/index.js';

/** Panel → Śmieci: wpis całego roku naraz, usuwanie terminów pojemnika, adres kalendarza (26b). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Najwięcej ręcznych terminów w bazie (kilka pojemników × rok). */
export const MAX_MANUAL = 1000;

function binOf(db: DB, f: FormData) {
	const bin = str(f, 'bin');
	if (!bins(wasteRules(db)).some((r) => r.bin === bin)) throw new InputError(t('guide.waste.err.bin'));
	return bin;
}

/**
 * Daty z formularza „cały rok”: seria (pierwszy wywóz, co ile tygodni, do kiedy) albo wklejona lista.
 * Ta sama funkcja co podgląd w przeglądarce; daty sprzed `today` są pomijane.
 */
export function datesFromForm(f: FormData, today: string): string[] {
	const dates =
		str(f, 'mode') === 'list'
			? parseDateList(str(f, 'text'), Number(str(f, 'year')) || Number(today.slice(0, 4))).dates
			: seriesDates({ first: str(f, 'first'), to: str(f, 'to'), every: Number(str(f, 'every')) });
	return dates.filter((d) => d >= today);
}

/** Zapis wielu terminów jednego pojemnika (bez powtórzeń z już wpisanymi). Zwraca liczbę dodanych. */
export function addManualPickups(db: DB, f: FormData, today: string): number {
	const bin = binOf(db, f);
	const dates = datesFromForm(f, today);
	if (!dates.length) throw new InputError(t('guide.waste.err.noDates'));
	const list = getSetting(db, 'wasteManual').filter((p) => p.date >= today);
	const have = new Set(list.map((p) => `${p.date}:${p.bin}`));
	const fresh = dates.filter((d) => !have.has(`${d}:${bin}`)).map((date) => ({ date, bin }));
	if (list.length + fresh.length > MAX_MANUAL) throw new InputError(t('guide.waste.err.tooMany', { n: MAX_MANUAL }));
	setSetting(db, 'wasteManual', [...list, ...fresh].sort((a, b) => a.date.localeCompare(b.date) || a.bin.localeCompare(b.bin)));
	return fresh.length;
}

/** Usuwa wszystkie przyszłe ręczne terminy jednego pojemnika (np. po pomyłce w serii). */
export function deleteManualBin(db: DB, f: FormData, today: string) {
	const bin = str(f, 'bin');
	setSetting(
		db,
		'wasteManual',
		getSetting(db, 'wasteManual').filter((p) => p.bin !== bin && p.date >= today)
	);
}

/** Adres kalendarza iCal gminy (to samo pole co w Ustawieniach – tu, gdzie się go szuka). */
export function saveWasteUrl(db: DB, f: FormData) {
	const url = str(f, 'wasteIcalUrl');
	if (url && !/^https?:\/\/\S+$/.test(url)) throw new InputError(t('err.wasteUrl'));
	if (url.length > 500) throw new InputError(t('err.wasteUrl'));
	setSetting(db, 'wasteIcalUrl', url || null);
}
