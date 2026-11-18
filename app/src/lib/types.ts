import type { ModuleData } from '#lib/modules/data.js';
import type { KioskLayers } from './calendars.js';

export interface Member {
	id: string;
	name: string;
	color: string;
	avatar: string | null;
}

export type EventKind = 'event' | 'waste' | 'ferien' | 'kita' | 'birthday';

export interface CalEvent {
	id: string;
	title: string;
	/** 'YYYY-MM-DD' dla całodniowych, ISO dla godzinowych */
	start: string;
	end: string;
	allDay: boolean;
	memberId: string | null;
	kind: EventKind;
	/** pojemnik (id z reguł śmieci) i jego kolor */
	bin?: string;
	binColor?: string;
	location?: string;
	description?: string;
	// --- 26a: calendar layers ---
	/** warstwa („Kalendarze”), np. 'local', 'google:<id>', 'ical:<uuid>', 'waste' */
	calendarId?: string;
	/** kolor kalendarza (gdy ustawiony w panelu) – patrz `eventColor` */
	color?: string;
	/** ikona kalendarza przed tytułem ('' = bez) */
	icon?: string;
}

export interface WeatherDay {
	date: string;
	code: number;
	max: number;
	min: number;
}

export interface Weather {
	now: { temp: number; code: number };
	days: WeatherDay[];
}

export interface ShoppingItem {
	id: string;
	name: string;
	spec?: string;
	icon?: string;
}

export interface Note {
	id: string;
	text: string;
	memberId: string | null;
	expiresAt: string;
}

export interface TaskItem {
	key: string;
	title: string;
	memberId: string | null;
	kind: 'chore' | 'waste';
	/** pojemnik (id z reguł śmieci) i jego kolor */
	bin?: string;
	binColor?: string;
	overdue: boolean;
}

export interface SourceStatus {
	ok: boolean;
	fetchedAt: string | null;
	error?: string;
}

export interface Dashboard {
	now: string;
	today: string;
	phase: 'day' | 'evening' | 'night';
	members: Member[];
	/** aktywne moduły w kolejności z panelu */
	enabled: string[];
	/** wydarzenia ze wszystkich aktywnych modułów (kalendarz, ferie, śmieci…) */
	events: CalEvent[];
	/** zadania do odhaczenia (wywóz śmieci, zadania domowe) */
	tasks: TaskItem[];
	/** dane aktywnych modułów; wyłączony moduł = brak klucza */
	modules: Partial<ModuleData>;
	sources: Record<string, SourceStatus>;
	offlineSince: string | null;
	/** Google wymaga ponownego zalogowania w panelu */
	googleReauth: boolean;
	// --- 26a: calendar layers ---
	/** kalendarze widoczne na kiosku (legenda, szybkie przełączanie) */
	calendars: KioskLayers;
	/** czy pokazywać święta (nazwy dni wolnych) – moduł włączony i warstwa nie ukryta */
	publicHolidays: boolean;
}

export type RemoveKind = 'shopping' | 'note' | 'task';
export type FlowKind = 'event' | 'note' | 'chore' | 'shopping';
