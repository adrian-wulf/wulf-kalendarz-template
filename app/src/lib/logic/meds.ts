import { addDays, isoWeekday, localParts, localTime, parseHHMM } from './dates.js';

/**
 * Leki: plan dawek (godziny, dni tygodnia) i stan każdej dawki w danej chwili. Czysta logika.
 * Godzina dawki to czas lokalny w strefie regionu – zmiana czasu (DST) nie przesuwa „8:00”.
 *
 * Medication schedules: which doses are upcoming, due, overdue or taken at a given moment.
 */

export interface MedPlan {
	id: number;
	memberId: string | null;
	name: string;
	dose: string;
	/** 'HH:MM', posortowane */
	times: string[];
	/** 1 = poniedziałek … 7 = niedziela; pusta lista = codziennie */
	days: number[];
	/** od kiedy / do kiedy (włącznie); null = bez ograniczenia */
	startDate: string | null;
	endDate: string | null;
	active: boolean;
}

export interface DoseLog {
	id: number;
	medId: number;
	date: string;
	time: string;
	takenAt: string;
}

/** upcoming – później; due – pora (od `lead` min przed do `grace` min po); overdue – po czasie; taken – wzięte */
export type DoseState = 'upcoming' | 'due' | 'overdue' | 'taken';

export interface Dose {
	medId: number;
	memberId: string | null;
	name: string;
	dose: string;
	date: string;
	time: string;
	/** moment dawki (ISO, UTC) */
	at: string;
	state: DoseState;
	takenAt: string | null;
	logId: number | null;
}

export interface DoseWindow {
	/** ile minut przed porą dawka jest już „do wzięcia” */
	lead: number;
	/** ile minut po porze dawka staje się „zaległa” */
	grace: number;
}

export const DEFAULT_WINDOW: DoseWindow = { lead: 30, grace: 60 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s);

/** Czy plan obowiązuje w danym dniu. */
export function scheduledOn(m: MedPlan, date: string): boolean {
	if (!m.active || !m.times.length) return false;
	if (m.startDate && date < m.startDate) return false;
	if (m.endDate && date > m.endDate) return false;
	return !m.days.length || m.days.includes(isoWeekday(date));
}

/** Moment dawki: lokalna godzina w danym dniu (z uwzględnieniem DST, patrz `localTime`). */
export function doseInstant(date: string, time: string, tz?: string): Date {
	const min = parseHHMM(time);
	return localTime(date, Math.floor(min / 60), min % 60, tz);
}

export function doseState(at: Date, now: Date, taken: boolean, w: DoseWindow = DEFAULT_WINDOW): DoseState {
	if (taken) return 'taken';
	const diff = (now.getTime() - at.getTime()) / 60_000;
	if (diff > w.grace) return 'overdue';
	if (diff >= -w.lead) return 'due';
	return 'upcoming';
}

/** Dawki z jednego dnia, posortowane po godzinie. */
export function dosesOn(meds: MedPlan[], logs: DoseLog[], date: string, now: Date, w: DoseWindow = DEFAULT_WINDOW, tz?: string): Dose[] {
	const out: Dose[] = [];
	for (const m of meds) {
		if (!scheduledOn(m, date)) continue;
		for (const time of m.times) {
			const log = logs.find((l) => l.medId === m.id && l.date === date && l.time === time) ?? null;
			const at = doseInstant(date, time, tz);
			out.push({
				medId: m.id,
				memberId: m.memberId,
				name: m.name,
				dose: m.dose,
				date,
				time,
				at: at.toISOString(),
				state: doseState(at, now, !!log, w),
				takenAt: log?.takenAt ?? null,
				logId: log?.id ?? null
			});
		}
	}
	return out.sort((a, b) => a.at.localeCompare(b.at) || a.name.localeCompare(b.name));
}

/**
 * Dawki na ekran: dzisiejsze plus niewzięte wieczorne (od 18:00) z wczoraj – do południa, żeby
 * dawka z 22:00 nie znikała o północy, ale też nie wisiała cały następny dzień. Wzięte zostają na liście (z godziną wzięcia), żeby było widać, co zrobione.
 */
export function kioskDoses(meds: MedPlan[], logs: DoseLog[], today: string, now: Date, w: DoseWindow = DEFAULT_WINDOW, tz?: string): Dose[] {
	const morning = localParts(now, tz).minutes < 12 * 60;
	const yesterday = morning ? dosesOn(meds, logs, addDays(today, -1), now, w, tz).filter((d) => d.state === 'overdue' && d.time >= '18:00') : [];
	return [...yesterday, ...dosesOn(meds, logs, today, now, w, tz)];
}

export interface DayHistory {
	date: string;
	planned: number;
	taken: number;
}

/** Historia: ile dawek zaplanowano i wzięto w ostatnich `days` dniach (bez dzisiaj, najnowsze pierwsze). */
export function history(m: MedPlan, logs: DoseLog[], today: string, days = 14): DayHistory[] {
	const out: DayHistory[] = [];
	for (let i = 1; i <= days; i++) {
		const date = addDays(today, -i);
		const planned = scheduledOn(m, date) ? m.times.length : 0;
		const taken = logs.filter((l) => l.medId === m.id && l.date === date && m.times.includes(l.time)).length;
		if (planned || taken) out.push({ date, planned, taken });
	}
	return out;
}

/** „08:00, 20:00” z pola formularza → posortowana lista bez powtórzeń; null przy złym formacie. */
export function parseTimes(v: string): string[] | null {
	const parts = v
		.split(/[,;\s]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => s.replace('.', ':'))
		.map((s) => (/^\d:\d\d$/.test(s) ? `0${s}` : s));
	if (!parts.length || parts.length > 8 || !parts.every(isTime)) return null;
	return [...new Set(parts)].sort();
}
