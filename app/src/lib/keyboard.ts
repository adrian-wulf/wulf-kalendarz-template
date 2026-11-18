import type { Lang } from './i18n/index.js';

/**
 * Układy klawiatury ekranowej (kiosk pod Cage nie ma systemowej). Domyślnie układ języka
 * interfejsu; przycisk 🌐 przełącza po kolei. Ostatni rząd `extra` to znaki narodowe
 * (pusty rząd zostaje, żeby klawiatura nie zmieniała wysokości przy przełączaniu).
 */
export interface KeyboardLayout {
	id: Lang;
	/** napis na przycisku przełączania */
	label: string;
	rows: string[][];
	extra: string[];
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const KEYBOARD_LAYOUTS: Record<Lang, KeyboardLayout> = {
	pl: {
		id: 'pl',
		label: 'PL',
		rows: [DIGITS, ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']],
		extra: ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż']
	},
	de: {
		id: 'de',
		label: 'DE',
		rows: [
			DIGITS,
			['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
			['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
			['⇧', 'y', 'x', 'c', 'v', 'b', 'n', 'm', 'ß', '⌫']
		],
		extra: []
	},
	en: {
		id: 'en',
		label: 'EN',
		rows: [DIGITS, ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']],
		extra: []
	}
};

const ORDER: Lang[] = ['pl', 'de', 'en'];

/** Następny układ po naciśnięciu 🌐. */
export const nextLayout = (id: Lang): Lang => ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];

/** Wielka litera klawisza (ß nie ma sensownej wielkiej na klawiaturze). */
export const upperKey = (k: string) => (k.length === 1 && k !== 'ß' ? k.toLocaleUpperCase() : k);
