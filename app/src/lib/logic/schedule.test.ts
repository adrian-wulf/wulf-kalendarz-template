import { afterEach, describe, expect, it } from 'vitest';
import { brightnessAt, brightnessOf, DEFAULT_BRIGHTNESS, isWeekendNight, nightTimes, phaseAt, type DisplaySchedule } from './schedule';
import { localTime, setTimeZone } from './dates';

/** Moment o lokalnej godzinie (strefa Europe/Berlin – domyślna w testach). */
const at = (date: string, hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return localTime(date, h, m);
};

// 2026-11-13 to piątek, 14 – sobota, 15 – niedziela, 16 – poniedziałek.
const S: DisplaySchedule = {
	eveningFrom: '21:00',
	nightFrom: '22:30',
	nightTo: '06:00',
	weekend: { eveningFrom: '22:00', nightFrom: '00:30', nightTo: '08:00' }
};

afterEach(() => setTimeZone('Europe/Berlin'));

describe('plan ekranu: tydzień i weekend', () => {
	it('noc weekendowa = piątek i sobota wieczorem', () => {
		expect(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map(isWeekendNight)).toEqual([false, true, true, false]);
		expect(nightTimes(S, '2026-11-13')).toBe(S.weekend);
		expect(nightTimes(S, '2026-11-15')).toBe(S);
		// bez osobnego weekendu – jak w tygodniu
		expect(nightTimes({ ...S, weekend: undefined }, '2026-11-14').nightFrom).toBe('22:30');
	});

	it('czwartek: wieczór i noc przez północ (godziny tygodniowe)', () => {
		expect(phaseAt(at('2026-11-12', '20:59'), S)).toBe('day');
		expect(phaseAt(at('2026-11-12', '21:00'), S)).toBe('evening');
		expect(phaseAt(at('2026-11-12', '22:30'), S)).toBe('night');
		expect(phaseAt(at('2026-11-12', '23:59'), S)).toBe('night');
		expect(phaseAt(at('2026-11-13', '00:00'), S)).toBe('night');
		expect(phaseAt(at('2026-11-13', '05:59'), S)).toBe('night');
		expect(phaseAt(at('2026-11-13', '06:00'), S)).toBe('day');
	});

	it('piątek wieczorem już weekend: wieczór od 22:00, zgaszenie dopiero po północy', () => {
		expect(phaseAt(at('2026-11-13', '21:30'), S)).toBe('day');
		expect(phaseAt(at('2026-11-13', '22:00'), S)).toBe('evening');
		expect(phaseAt(at('2026-11-13', '23:59'), S)).toBe('evening');
		// wieczór przechodzi przez północ, noc zaczyna się w sobotę 00:30
		expect(phaseAt(at('2026-11-14', '00:10'), S)).toBe('evening');
		expect(phaseAt(at('2026-11-14', '00:30'), S)).toBe('night');
		// sobota rano: włączenie wg weekendu (8:00), nie 6:00
		expect(phaseAt(at('2026-11-14', '06:30'), S)).toBe('night');
		expect(phaseAt(at('2026-11-14', '08:00'), S)).toBe('day');
	});

	it('niedziela wieczorem znowu tydzień: noc od 22:30, poniedziałek 6:00', () => {
		// niedziela rano – jeszcze noc z soboty (weekend)
		expect(phaseAt(at('2026-11-15', '07:59'), S)).toBe('night');
		expect(phaseAt(at('2026-11-15', '08:00'), S)).toBe('day');
		expect(phaseAt(at('2026-11-15', '21:00'), S)).toBe('evening');
		expect(phaseAt(at('2026-11-15', '22:30'), S)).toBe('night');
		expect(phaseAt(at('2026-11-16', '05:59'), S)).toBe('night');
		expect(phaseAt(at('2026-11-16', '06:00'), S)).toBe('day');
	});

	it('zapis sprzed podziału (bez weekend i jasności) działa jak dotąd', () => {
		const old: DisplaySchedule = { eveningFrom: '21:00', nightFrom: '23:00', nightTo: '06:00' };
		expect(phaseAt(at('2026-11-14', '22:00'), old)).toBe('evening');
		expect(phaseAt(at('2026-11-14', '23:00'), old)).toBe('night');
		expect(phaseAt(at('2026-11-15', '06:00'), old)).toBe('day');
		expect(brightnessOf(old)).toEqual(DEFAULT_BRIGHTNESS);
	});

	it('noc w całości po północy i wieczór od razu nocą', () => {
		const late: DisplaySchedule = { eveningFrom: '23:00', nightFrom: '01:00', nightTo: '05:30' };
		expect(phaseAt(at('2026-11-12', '23:30'), late)).toBe('evening');
		expect(phaseAt(at('2026-11-13', '00:59'), late)).toBe('evening');
		expect(phaseAt(at('2026-11-13', '01:00'), late)).toBe('night');
		expect(phaseAt(at('2026-11-13', '05:30'), late)).toBe('day');
		// wieczór od tej samej godziny co noc = bez wieczoru
		const none: DisplaySchedule = { eveningFrom: '22:00', nightFrom: '22:00', nightTo: '06:00' };
		expect(phaseAt(at('2026-11-12', '21:59'), none)).toBe('day');
		expect(phaseAt(at('2026-11-12', '22:00'), none)).toBe('night');
	});

	it('zmiana czasu i inna strefa', () => {
		// 2026-10-25: koniec czasu letniego; noc z soboty (weekend) do 8:00
		expect(phaseAt(at('2026-10-25', '07:30'), S)).toBe('night');
		expect(phaseAt(at('2026-10-25', '08:00'), S)).toBe('day');
		setTimeZone('Europe/Warsaw');
		expect(phaseAt(new Date('2026-11-12T21:45:00Z'), S)).toBe('night'); // 22:45 w Warszawie
	});

	it('jasność: zapisane procenty na wierzchu domyślnych', () => {
		const b = { ...S, brightness: { day: 80, evening: 30, night: 0, wake: 25 } };
		expect(brightnessAt('day', b)).toBe(80);
		expect(brightnessAt('evening', b)).toBe(30);
		expect(brightnessAt('night', S)).toBe(0);
		expect(brightnessAt('evening', S)).toBe(55);
	});
});
