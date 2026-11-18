/**
 * Daty kalendarzowe jako 'YYYY-MM-DD'. Czas lokalny liczony w strefie z ustawień regionu
 * (domyślnie Europe/Berlin) – ustawianej raz przy starcie i po zmianie w panelu (`setTimeZone`).
 */
export const DEFAULT_TZ = 'Europe/Berlin';

let zone = DEFAULT_TZ;

/** Bieżąca strefa czasowa (IANA), np. 'Europe/Warsaw'. */
export const localZone = () => zone;

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export function setTimeZone(tz: string) {
	if (!isValidTimeZone(tz)) throw new Error(`Nieznana strefa czasowa: ${tz}`);
	zone = tz;
}

export function addDays(date: string, n: number): string {
	const d = new Date(date + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** 1 = poniedziałek … 7 = niedziela */
export function isoWeekday(date: string): number {
	const wd = new Date(date + 'T00:00:00Z').getUTCDay();
	return wd === 0 ? 7 : wd;
}

export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		});
		formatters.set(tz, f);
	}
	return f;
}

/** Lokalna data i godzina (w strefie z ustawień albo podanej) dla danego momentu. */
export function localParts(at: Date, tz = zone): { date: string; minutes: number } {
	const p = Object.fromEntries(partsFormatter(tz).formatToParts(at).map((x) => [x.type, x.value]));
	return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Przesunięcie strefy względem UTC w minutach w danej chwili (np. +60 zimą w Berlinie). */
function offsetMinutes(t: number, tz: string): number {
	const { date, minutes } = localParts(new Date(t), tz);
	const asUtc = Date.parse(date + 'T00:00:00Z') + minutes * 60_000;
	return Math.round((asUtc - Math.floor(t / 60_000) * 60_000) / 60_000);
}

/**
 * Moment odpowiadający lokalnej godzinie (uwzględnia czas letni/zimowy).
 * Godzina podwójna (jesienna zmiana) → wcześniejsze przesunięcie standardowe, czyli późniejszy moment;
 * godzina nieistniejąca (wiosenna zmiana) → liczona wg czasu standardowego.
 */
export function localTime(date: string, hh: number, mm = 0, tz = zone): Date {
	const guess = Date.parse(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
	const offsets = [...new Set([offsetMinutes(guess - 86_400_000, tz), offsetMinutes(guess, tz), offsetMinutes(guess + 86_400_000, tz)])].sort(
		(a, b) => a - b
	);
	for (const off of offsets) {
		const candidate = new Date(guess - off * 60_000);
		const p = localParts(candidate, tz);
		if (p.date === date && p.minutes === hh * 60 + mm) return candidate;
	}
	return new Date(guess - offsets[0] * 60_000);
}

export function parseHHMM(s: string): number {
	const [h, m] = s.split(':').map(Number);
	return h * 60 + m;
}
