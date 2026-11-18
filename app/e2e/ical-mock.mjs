// Atrapa serwera kalendarzy iCal dla e2e (subskrypcje): /klub.ics – kalendarz z datami względem dziś,
// /przekierowanie.ics – 302 na klub, /strona – zwykła strona HTML (czytelny błąd w panelu). Port z argumentu.
import { createServer } from 'node:http';

const day = (n) => {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10).replaceAll('-', '');
};

const ics = () =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'X-WR-CALNAME:Klub E2E',
		'BEGIN:VEVENT',
		'UID:e2e-trening',
		`DTSTART;TZID=Europe/Berlin:${day(2)}T170000`,
		`DTEND;TZID=Europe/Berlin:${day(2)}T180000`,
		'RRULE:FREQ=WEEKLY;COUNT=4',
		'SUMMARY:E2E Trening',
		'END:VEVENT',
		'BEGIN:VEVENT',
		'UID:e2e-mecz',
		`DTSTART;VALUE=DATE:${day(3)}`,
		'SUMMARY:E2E Mecz',
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');

createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (url.pathname === '/klub.ics') {
		res.writeHead(200, { 'content-type': 'text/calendar' });
		return res.end(ics());
	}
	if (url.pathname === '/przekierowanie.ics') {
		res.writeHead(302, { location: '/klub.ics' });
		return res.end();
	}
	if (url.pathname === '/strona') {
		res.writeHead(200, { 'content-type': 'text/html' });
		return res.end('<!doctype html><html><body>Klub</body></html>');
	}
	res.writeHead(404);
	res.end();
}).listen(Number(process.argv[2] ?? 4213));
