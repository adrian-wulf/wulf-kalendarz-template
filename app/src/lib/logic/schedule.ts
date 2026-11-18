import { addDays, isoWeekday, localParts, localTime, parseHHMM } from './dates';

export type Phase = 'day' | 'evening' | 'night';

/** Godziny jednej nocy: od kiedy przyciemnić (wieczór), od kiedy zgasić, kiedy włączyć rano. */
export interface NightTimes {
	eveningFrom: string; // 'HH:MM'
	nightFrom: string;
	nightTo: string;
}

/** Jasność podświetlenia w procentach; `night` 0 = ekran zgaszony, `wake` = nocne wybudzenie dotykiem. */
export interface Brightness {
	day: number;
	evening: number;
	night: number;
	wake: number;
}

/**
 * Plan ekranu. Pola główne to noce w tygodniu (zapis sprzed podziału – zgodny wstecz);
 * `weekend` – noce z piątku na sobotę i z soboty na niedzielę (brak = jak w tygodniu).
 */
export interface DisplaySchedule extends NightTimes {
	weekend?: NightTimes;
	brightness?: Brightness;
}

export const DEFAULT_SCHEDULE: DisplaySchedule = { eveningFrom: '21:00', nightFrom: '23:00', nightTo: '06:00' };

/** Poziomy jak dotąd na sztywno w `kiosk/ekran-agent.py`. */
export const DEFAULT_BRIGHTNESS: Brightness = { day: 100, evening: 55, night: 0, wake: 40 };

export const brightnessOf = (s: DisplaySchedule | undefined): Brightness => ({ ...DEFAULT_BRIGHTNESS, ...s?.brightness });

/** Noc należy do dnia, w którym się zaczyna: piątek i sobota wieczorem = noc weekendowa. */
export const isWeekendNight = (date: string) => {
	const wd = isoWeekday(date);
	return wd === 5 || wd === 6;
};

/** Godziny nocy zaczynającej się wieczorem dnia `date`. */
export function nightTimes(s: DisplaySchedule, date: string): NightTimes {
	return isWeekendNight(date) && s.weekend ? s.weekend : s;
}

const DAY = 24 * 60;
const NOON = 12 * 60;

/**
 * Noc dnia D jako przedziały w minutach od północy dnia D (mogą wychodzić poza 24:00).
 * Godziny przed południem należą do następnego dnia (np. wygaszenie o 00:30, włączenie o 6:00).
 */
function spans(n: NightTimes) {
	const at = (hhmm: string) => {
		const m = parseHHMM(hhmm);
		return m < NOON ? m + DAY : m;
	};
	const night = at(n.nightFrom);
	let wake = parseHHMM(n.nightTo);
	while (wake <= night) wake += DAY;
	const evening = Math.min(at(n.eveningFrom), night);
	return { evening, night, wake };
}

/** Pora dnia: noc wczorajsza może jeszcze trwać rano, dzisiejsza zaczyna się wieczorem. */
export function phaseAt(at: Date, s: DisplaySchedule = DEFAULT_SCHEDULE): Phase {
	const { date, minutes } = localParts(at);
	const prev = spans(nightTimes(s, addDays(date, -1)));
	const today = spans(nightTimes(s, date));
	const m = minutes;
	const inSpan = (from: number, to: number) => m >= from && m < to;
	if (inSpan(prev.night - DAY, prev.wake - DAY) || inSpan(today.night, today.wake)) return 'night';
	if (inSpan(prev.evening - DAY, prev.night - DAY) || inSpan(today.evening, today.night)) return 'evening';
	return 'day';
}

/** Jasność (0–100) dla pory dnia. */
export const brightnessAt = (phase: Phase, s: DisplaySchedule | undefined) => brightnessOf(s)[phase];

export type NoteDuration = 'evening' | 'tomorrow' | '3days';

/** Do kiedy wisi kartka dodana w danym momencie. */
export function noteExpiry(createdAt: Date, duration: NoteDuration): Date {
	const { date } = localParts(createdAt);
	switch (duration) {
		case 'evening':
			return localTime(date, 23, 0);
		case 'tomorrow':
			return localTime(addDays(date, 1), 6, 0);
		case '3days':
			return localTime(addDays(date, 3), 6, 0);
	}
}
