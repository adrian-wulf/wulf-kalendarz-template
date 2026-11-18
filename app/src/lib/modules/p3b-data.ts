import type { MealSlot } from '#lib/logic/meals.js';

/** Dane kafelków modułów posiłków, zadań dzieci i odliczania (`Dashboard.modules`). */

export interface MealEntry {
	slot: MealSlot;
	recipeId: number | null;
	name: string;
	emoji: string;
}

export interface MealDay {
	date: string;
	meals: MealEntry[];
}

export interface MealsTile {
	slots: MealSlot[];
	/** dziś i 6 kolejnych dni */
	days: MealDay[];
}

export interface KidsTile {
	kids: { memberId: string; points: number; done: number; total: number }[];
	/** prośby o nagrody czekające na zgodę */
	pending: number;
}

export interface CountdownItem {
	id: number | string;
	title: string;
	emoji: string;
	next: string;
	days: number;
	memberId: string | null;
}

export interface CountdownTile {
	/** ile pokazać na kafelku (1–3) */
	show: number;
	/** nadchodzące, najbliższe najpierw (do 30) */
	items: CountdownItem[];
}
