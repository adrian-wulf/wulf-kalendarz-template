import { addDays, daysBetween } from './dates.js';

/**
 * „Co X dni” albo „co X–Y dni”: wspólna logika okna dla węży (karmienie) i modułu Opieka
 * (podlewanie, filtr, odkamienianie…). Czysta funkcja na datach 'YYYY-MM-DD'.
 *
 * Recurring window "every X (to Y) days" shared by the snakes and the care module.
 */

export interface RecurringWindow {
	/** ostatnie wykonanie (null = jeszcze nigdy) */
	last: string | null;
	/** początek okna: najwcześniej po tylu dniach */
	min: number;
	/** koniec okna: najpóźniej po tylu dniach (= min, gdy bez zakresu) */
	max: number;
	/** wstrzymane do tego dnia – okno nie zaczyna się wcześniej */
	pauseUntil?: string | null;
}

/**
 * paused – wstrzymane; overdue – po terminie; due – termin dziś (albo nigdy nie zrobione);
 * open – w oknie (można już zrobić); soon – jutro (tylko bez zakresu); ok – jeszcze nie.
 */
export type WindowState = 'paused' | 'overdue' | 'due' | 'open' | 'soon' | 'ok';

export interface WindowView {
	/** od kiedy można (początek okna) */
	from: string | null;
	/** najpóźniej (koniec okna) */
	dueBy: string | null;
	state: WindowState;
}

export function recurringWindow(w: RecurringWindow, today: string): WindowView {
	const max = Math.max(w.min, w.max);
	let from = w.last ? addDays(w.last, w.min) : null;
	let dueBy = w.last ? addDays(w.last, max) : null;
	const pause = w.pauseUntil ?? null;
	if (pause && (!from || from < pause)) from = pause;
	if (pause && (!dueBy || dueBy < pause)) dueBy = pause;
	const range = max > w.min;
	const state: WindowState =
		pause && today < pause
			? 'paused'
			: !dueBy || dueBy === today
				? 'due'
				: dueBy < today
					? 'overdue'
					: from! <= today
						? 'open'
						: !range && daysBetween(today, from!) <= 1
							? 'soon'
							: 'ok';
	return { from, dueBy, state };
}

/** Czy pozycję trzeba pokazać jako „do zrobienia” (dziś, po terminie albo w oknie). */
export const isActionable = (s: WindowState) => s === 'due' || s === 'overdue' || s === 'open';
