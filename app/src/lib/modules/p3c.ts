/**
 * Dane kafelków modułów leki, opieka, odjazdy i Home Assistant (`Dashboard.modules[id]`).
 * Tylko typy – czyta je też przeglądarka.
 */
import type { Dose } from '#lib/logic/meds.js';
import type { CareView } from '#lib/logic/care.js';

export interface MedsTileData {
	doses: Dose[];
	due: number;
	overdue: number;
}

export interface CareTileData {
	items: CareView[];
	next: CareView | null;
	overdue: number;
}

export interface TransitDeparture {
	id: string;
	line: string;
	product: string;
	direction: string;
	/** minuty do odjazdu (z prognozą); null = odwołany */
	minutes: number | null;
	/** 'HH:MM' planowo */
	time: string;
	/** opóźnienie w minutach; null = brak danych na żywo */
	delay: number | null;
	cancelled: boolean;
	platform: string | null;
	color: string | null;
}

export interface TransitTileData {
	/** nazwa wybranego przystanku; null = nie wybrano */
	stop: string | null;
	departures: TransitDeparture[];
	realtime: boolean;
	/** ostatni błąd pobierania (dane mogą być starsze) */
	error: string | null;
	/** kiedy pobrano (ISO) */
	fetchedAt: string | null;
}

export type HaKind = 'sensor' | 'binary_sensor' | 'light' | 'switch' | 'lock' | 'camera' | 'climate' | 'cover' | 'other';

export interface HaEntityView {
	entityId: string;
	label: string;
	kind: HaKind;
	/** stan do pokazania (z jednostką), np. „21,5 °C”, „on” */
	state: string;
	/** włączone / zamknięte / wykryto – podświetlenie kafelka */
	active: boolean;
	unavailable: boolean;
	/** można przełączyć z kiosku (światło, gniazdko – nie zamek) */
	toggle: boolean;
	icon: string;
}

export interface HaTileData {
	configured: boolean;
	error: string | null;
	entities: HaEntityView[];
	cameras: { entityId: string; label: string }[];
	cameraSeconds: number;
}
