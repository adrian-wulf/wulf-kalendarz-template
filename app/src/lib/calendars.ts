import type { CalEvent, Member } from './types.js';

/**
 * Warstwy kalendarza („Kalendarze”) – część wspólna dla serwera, kiosku, telefonu i panelu.
 *
 * Zasada kolorów (opisana też w docs/calendars.md):
 * 1. Wywóz śmieci – zawsze kolor pojemnika (żółty worek ma być żółty).
 * 2. Kalendarz z własnym kolorem – pasek wydarzenia w kolorze kalendarza.
 * 3. Kalendarz „automatycznie” (domyślnie, także po aktualizacji) – jak przed warstwami: kolor osoby,
 *    a bez osoby kolor akcentu motywu.
 * Osoba jest zawsze widoczna osobno: awatar i imię w jej kolorze.
 *
 * Calendar layers: shared types and the colour rule (bin colour > calendar colour > member colour > accent).
 */

export type LayerKind = 'google' | 'local' | 'ical' | 'birthdays' | 'waste' | 'ferien' | 'holidays';

/** Warstwa na kiosku i telefonie: tylko to, co potrzebne do legendy i przełączników. */
export interface LayerChip {
	id: string;
	kind: LayerKind;
	name: string;
	/** kolor do legendy (własny, osoby albo null = akcent motywu) */
	swatch: string | null;
	icon: string;
	memberId: string | null;
	/** kiosk: ukryty do północy */
	hiddenToday: boolean;
}

/** Stan warstw na kiosku (część `Dashboard`). */
export interface KioskLayers {
	list: LayerChip[];
	/** panel → Kalendarze → „Zablokuj przełączanie na kiosku” (wtedy po PIN-ie) */
	locked: boolean;
	/** ile kalendarzy ukryto na kiosku na stałe w panelu */
	hiddenInPanel: number;
}

/** Kolory do wyboru dla kalendarzy – nowa subskrypcja / import dostaje kolejny wolny. */
export const LAYER_PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4b5563', '#65a30d', '#78716c'] as const;

/** Ikony do wyboru (jedno dotknięcie zamiast szukania emoji na klawiaturze). */
export const LAYER_ICONS = ['📅', '👪', '🏫', '🧒', '⚽', '🏊', '🎵', '🎨', '💼', '🏥', '⛪', '✈️', '🐾', '🎂', '🗑', '🏖', '🎉', '⭐'] as const;

/** Odświeżanie subskrypcji (minuty) – do wyboru w panelu. */
export const REFRESH_CHOICES = [15, 60, 360, 1440] as const;
export const DEFAULT_REFRESH = 60;

/** Kolor paska wydarzenia wg zasady wyżej. */
export function eventColor(e: CalEvent, member?: Pick<Member, 'color'>): string {
	if (e.bin && e.binColor) return e.binColor;
	if (e.color) return e.color;
	if (e.kind === 'kita' || e.kind === 'ferien') return 'var(--accent)';
	return member?.color ?? 'var(--accent)';
}

/** Ikona przed tytułem: z kalendarza, a bez warstwy – jak dotąd (śmieci, urodziny). */
export function eventIcon(e: CalEvent): string {
	const icon = e.icon !== undefined ? e.icon : e.kind === 'waste' ? '🗑' : e.kind === 'birthday' ? '🎂' : '';
	return icon ? `${icon} ` : '';
}
