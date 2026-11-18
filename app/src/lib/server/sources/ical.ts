import { addDays, isoWeekday } from '#lib/logic/dates.js';

export interface IcalEvent {
	uid: string;
	summary: string;
	/** 'YYYY-MM-DD' dla całodniowych, ISO dla godzinowych */
	start: string;
	allDay: boolean;
}

/** Szczegóły wydarzenia (opcja `details`) – dla subskrypcji i importu kalendarzy. */
export interface IcalDetails {
	/** koniec (wyłączny) w tym samym formacie co `start` */
	end: string;
	/** strefa z DTSTART;TZID=… (null = UTC z „Z” albo czas „pływający”) */
	tzid: string | null;
	location?: string;
	description?: string;
}

export interface IcalOptions {
	/** dodaj koniec, strefę, miejsce i opis (`IcalDetails`) */
	details?: boolean;
	/** do jakiego dnia (włącznie) rozwijać powtórzenia bez końca; domyślnie dziś + 2 lata */
	horizon?: string;
	/** dokąd zgłaszać pominięte wydarzenia (domyślnie console.warn) */
	warn?: (msg: string) => void;
}

/** Bezpiecznik: maksymalna liczba terminów z jednej reguły RRULE. */
const MAX_INSTANCES = 2000;

function unescape(v: string): string {
	return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

interface When {
	date: string;
	/** 'HH:MM:SS' albo null (cały dzień) */
	time: string | null;
	utc: boolean;
}

function parseWhen(value: string): When {
	const d = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
	if (!d) throw new Error(`Nieznany format daty iCal: ${value}`);
	return { date: `${d[1]}-${d[2]}-${d[3]}`, time: d[4] ? `${d[4]}:${d[5]}:${d[6]}` : null, utc: !!d[7] };
}

// Czas bez 'Z' traktujemy jak lokalny (dla kalendarzy wywozu to i tak godzina orientacyjna).
const startOf = (w: When, date = w.date) => (w.time ? `${date}T${w.time}${w.utc ? 'Z' : ''}` : date);

const WD: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Dni miesiąca pasujące do BYDAY (np. MO, 1MO, -1FR) albo BYMONTHDAY (np. 15, -1). */
function monthDays(y: number, m: number, byDay: { n: number; wd: number }[], byMonthDay: number[], fallbackDay: number): string[] {
	const last = daysInMonth(y, m);
	const iso = (d: number) => `${y}-${pad(m)}-${pad(d)}`;
	const out = new Set<number>();
	if (byDay.length) {
		for (const { n, wd } of byDay) {
			const all: number[] = [];
			for (let d = 1; d <= last; d++) if (isoWeekday(iso(d)) === wd) all.push(d);
			if (!n) all.forEach((d) => out.add(d));
			else {
				const d = n > 0 ? all[n - 1] : all[all.length + n];
				if (d) out.add(d);
			}
		}
	} else if (byMonthDay.length) {
		for (const n of byMonthDay) {
			const d = n > 0 ? n : last + n + 1;
			if (d >= 1 && d <= last) out.add(d);
		}
	} else if (fallbackDay <= last) out.add(fallbackDay);
	return [...out].sort((a, b) => a - b).map(iso);
}

/**
 * Daty z RRULE (RFC 5545, podzbiór: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL,
 * BYDAY – też z numerem w MONTHLY/YEARLY, np. 1MO, -1FR – BYMONTHDAY, BYMONTH, WKST pomijane).
 * Pierwszy termin to zawsze DTSTART. Bez COUNT/UNTIL – do `horizon`.
 */
export function expandRrule(rrule: string, start: string, horizon: string): string[] {
	const p = Object.fromEntries(
		rrule
			.split(';')
			.map((kv) => kv.split('='))
			.filter((kv) => kv.length === 2)
			.map(([k, v]) => [k.trim().toUpperCase(), v.trim().toUpperCase()])
	);
	const freq = p.FREQ;
	if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) throw new Error(`Nieobsługiwane RRULE: ${rrule}`);
	const interval = Math.max(1, Number(p.INTERVAL) || 1);
	const count = p.COUNT ? Number(p.COUNT) : Infinity;
	const until = p.UNTIL ? parseWhen(p.UNTIL).date : null;
	const end = until && until < horizon ? until : horizon;
	const byDay = (p.BYDAY ? p.BYDAY.split(',') : []).map((s: string) => {
		const m = s.match(/^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/);
		if (!m) throw new Error(`Nieobsługiwane BYDAY: ${s}`);
		return { n: m[1] ? Number(m[1]) : 0, wd: WD[m[2]] };
	});
	const byMonthDay = p.BYMONTHDAY ? p.BYMONTHDAY.split(',').map(Number) : [];
	const byMonth = p.BYMONTH ? p.BYMONTH.split(',').map(Number) : [];
	const [y0, m0, d0] = start.split('-').map(Number);

	const out: string[] = [start];
	const push = (d: string) => {
		if (d <= start || (byMonth.length && !byMonth.includes(Number(d.slice(5, 7))))) return true;
		if (d > end || out.length >= Math.min(count, MAX_INSTANCES)) return false;
		out.push(d);
		return true;
	};
	for (let k = 1, guard = 0; guard < 10_000; k++, guard++) {
		let batch: string[];
		if (freq === 'DAILY') batch = [addDays(start, (k - 1) * interval)];
		else if (freq === 'WEEKLY') {
			const monday = addDays(addDays(start, -(isoWeekday(start) - 1)), (k - 1) * 7 * interval);
			const wds = byDay.length ? [...new Set(byDay.map((b) => b.wd))].sort() : [isoWeekday(start)];
			batch = wds.map((wd) => addDays(monday, wd - 1));
		} else if (freq === 'MONTHLY') {
			const idx = m0 - 1 + (k - 1) * interval;
			batch = monthDays(y0 + Math.floor(idx / 12), (idx % 12) + 1, byDay, byMonthDay, d0);
		} else {
			const y = y0 + (k - 1) * interval;
			batch = (byMonth.length ? [...byMonth].sort((a, b) => a - b) : [m0]).flatMap((m) => monthDays(y, m, byDay, byMonthDay, d0));
		}
		if (!batch.length) continue;
		if (batch[0] > end) break;
		if (!batch.every(push)) break;
	}
	return out;
}

interface Raw {
	props: Record<string, string>;
	/** parametry właściwości, np. DTSTART → 'TZID=Europe/Berlin' */
	params: Record<string, string>;
	exdates: string[];
}

/** Dwukropek oddzielający wartość – pomija dwukropki w cudzysłowie parametrów (TZID="(UTC+01:00) …"). */
function valueColon(line: string): number {
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '"') quoted = !quoted;
		else if (line[i] === ':' && !quoted) return i;
	}
	return -1;
}

const TZID = /(?:^|;)TZID=("?)([^;:"]+)\1/i;

/** Czas trwania z DURATION (np. PT1H30M, P1D, P2W) w sekundach; null = nie da się odczytać. */
export function durationSeconds(v: string): number | null {
	const m = v.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
	if (!m || v.trim().toUpperCase() === 'P' || /T$/i.test(v.trim())) return null;
	const [, sign, w, d, h, min, sec] = m;
	const total = ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 24 + Number(h ?? 0)) * 3600 + Number(min ?? 0) * 60 + Number(sec ?? 0);
	return sign === '-' ? -total : total;
}

/** Ściana zegara (data + godzina z pliku) jako liczba ms – do liczenia różnic, bez stref. */
const wallMs = (w: When, date = w.date) => Date.parse(`${date}T${w.time ?? '00:00:00'}Z`);

/** Ms ściany zegara → 'YYYY-MM-DDTHH:MM:SS' (+Z, gdy początek był w UTC). */
const wallIso = (ms: number, utc: boolean) => new Date(ms).toISOString().slice(0, 19) + (utc ? 'Z' : '');

/**
 * Koniec wystąpienia: z DTEND (ta sama długość dla każdego powtórzenia) albo DURATION; bez nich –
 * całodniowe trwa dzień, godzinowe chwilę (RFC 5545) – tu godzinę, żeby było widać na ekranie.
 */
function endOf(r: Raw, w: When, date: string): string {
	const dur = r.props.DURATION ? durationSeconds(r.props.DURATION) : null;
	let length: number | null = dur !== null && dur > 0 ? dur * 1000 : null;
	if (length === null && r.props.DTEND) {
		try {
			const e = parseWhen(r.props.DTEND);
			const diff = w.time ? (e.utc && !w.utc ? NaN : wallMs(e) - wallMs(w)) : wallMs({ ...e, time: null }) - wallMs(w);
			if (diff > 0) length = diff;
		} catch {
			/* zły DTEND – jak bez końca */
		}
	}
	if (!w.time) return addDays(date, Math.max(1, Math.round((length ?? 86_400_000) / 86_400_000)));
	return wallIso(wallMs(w, date) + (length ?? 3_600_000), w.utc);
}

/**
 * Parser VEVENT dla kalendarzy wywozu: zawinięte linie, RRULE (patrz `expandRrule`), EXDATE,
 * RECURRENCE-ID (przeniesiony termin zastępuje termin z reguły). Podkomponenty (VALARM) są pomijane.
 * Wydarzenie, którego nie da się odczytać, jest pomijane z ostrzeżeniem – reszta pliku działa.
 */
export function parseIcal(text: string, o: IcalOptions & { details: true }): (IcalEvent & IcalDetails)[];
export function parseIcal(text: string, o?: IcalOptions): IcalEvent[];
export function parseIcal(text: string, o: IcalOptions = {}): IcalEvent[] {
	const horizon = o.horizon ?? addDays(new Date().toISOString().slice(0, 10), 730);
	const warn = o.warn ?? ((m: string) => console.warn(`iCal: ${m}`));
	const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
	const raws: Raw[] = [];
	let cur: Raw | null = null;
	let depth = 0; // zagnieżdżenie wewnątrz VEVENT (VALARM…)
	for (const rawLine of lines) {
		const line = rawLine.trim();
		const upper = line.toUpperCase();
		if (upper === 'BEGIN:VEVENT' && !cur) {
			cur = { props: {}, params: {}, exdates: [] };
			depth = 0;
		} else if (!cur) continue;
		else if (upper.startsWith('BEGIN:')) depth++;
		else if (upper.startsWith('END:') && depth > 0) depth--;
		else if (upper === 'END:VEVENT') {
			raws.push(cur);
			cur = null;
		} else if (depth === 0) {
			const i = valueColon(line);
			if (i < 0) continue;
			// Parametry mogą mieć dwukropek w cudzysłowie (TZID="…") – nazwa kończy się na pierwszym ':' poza nim.
			const head = line.slice(0, i);
			const [rawName, ...params] = head.split(';');
			const name = rawName.toUpperCase();
			const value = line.slice(i + 1).trim();
			if (name === 'EXDATE') cur.exdates.push(...value.split(','));
			else {
				cur.props[name] = value;
				if (params.length) cur.params[name] = params.join(';');
			}
		}
	}

	const events: IcalEvent[] = [];
	const overrides = new Set<string>(); // `${uid}|${dzień}` przeniesionych terminów
	for (const r of raws) {
		if (!r.props['RECURRENCE-ID'] || !r.props.UID) continue;
		try {
			overrides.add(`${r.props.UID}|${parseWhen(r.props['RECURRENCE-ID']).date}`);
		} catch {
			/* zły RECURRENCE-ID – zgłosi go pętla niżej */
		}
	}
	for (const r of raws) {
		const { DTSTART, SUMMARY, UID, RRULE } = r.props;
		if (!DTSTART || !SUMMARY) continue;
		try {
			const w = parseWhen(DTSTART);
			const summary = unescape(SUMMARY);
			const uid = UID ?? `${startOf(w)}-${summary}`;
			// odwołane (też pojedynczy termin z RECURRENCE-ID – już usunięty z reguły przez `overrides`)
			if (r.props.STATUS?.toUpperCase() === 'CANCELLED') continue;
			const extra = (d: string): Partial<IcalEvent & IcalDetails> => {
				if (!o.details) return {};
				const out: IcalDetails = { end: endOf(r, w, d), tzid: w.utc || !w.time ? null : (r.params.DTSTART?.match(TZID)?.[2] ?? null) };
				if (r.props.LOCATION) out.location = unescape(r.props.LOCATION);
				if (r.props.DESCRIPTION) out.description = unescape(r.props.DESCRIPTION);
				return out;
			};
			if (r.props['RECURRENCE-ID']) {
				// Przeniesiony termin: identyfikator jak termin z reguły, który zastępuje.
				const rid = o.details ? `${uid}|${parseWhen(r.props['RECURRENCE-ID']).date}` : uid;
				events.push({ uid: rid, summary, start: startOf(w), allDay: !w.time, ...extra(w.date) });
				continue;
			}
			const exdates = new Set(r.exdates.map((x) => parseWhen(x).date));
			const dates = RRULE ? expandRrule(RRULE, w.date, horizon) : [w.date];
			for (const d of dates) {
				if (exdates.has(d) || overrides.has(`${uid}|${d}`)) continue;
				events.push({ uid: dates.length > 1 ? `${uid}|${d}` : uid, summary, start: startOf(w, d), allDay: !w.time, ...extra(d) });
			}
		} catch (e) {
			warn(`pominięto „${SUMMARY}” (${DTSTART}): ${e instanceof Error ? e.message : e}`);
		}
	}
	return events;
}
