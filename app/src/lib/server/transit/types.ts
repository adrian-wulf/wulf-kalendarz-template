/**
 * Odjazdy komunikacji – wspólny kształt dla wszystkich dostawców (HAFAS REST, GTFS).
 * Nowy dostawca (np. API przewoźnika w Polsce) implementuje `TransitProvider` i trafia do `providers.ts`.
 */

export interface Departure {
	/** stały klucz (kurs + godzina planowa) */
	id: string;
	line: string;
	/** bus, tram, subway, suburban, regional, express, ferry… (HAFAS) albo route_type z GTFS */
	product: string;
	direction: string;
	/** odjazd z prognozą (ISO); null = odwołany bez prognozy */
	when: string | null;
	plannedWhen: string;
	/** opóźnienie w sekundach; null = brak danych na żywo (rozkład) */
	delay: number | null;
	cancelled: boolean;
	platform: string | null;
	/** kolor linii od przewoźnika (np. #CA1214) */
	color: string | null;
}

export interface StopHit {
	id: string;
	name: string;
	/** dodatkowa informacja do listy wyników (np. środki transportu, kod przystanku) */
	detail?: string;
}

/** Wynik źródła w `source_cache`. */
export interface TransitData {
	stopId: string;
	departures: Departure[];
	/** czy dane są na żywo (HAFAS) czy z rozkładu (GTFS) */
	realtime: boolean;
}

export class TransitError extends Error {}
