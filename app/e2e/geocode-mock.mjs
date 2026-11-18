// Atrapa geokodowania Open-Meteo dla testów e2e kreatora (bez sieci). Port z argumentu.
import { createServer } from 'node:http';

const PLACES = [
	{ name: 'Kraków', latitude: 50.06143, longitude: 19.93658, country: 'Polska', admin1: 'małopolskie' },
	{ name: 'Krakow am See', latitude: 53.65, longitude: 12.27, country: 'Niemcy', admin1: 'Meklemburgia-Pomorze Przednie' }
];

createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const name = (url.searchParams.get('name') ?? '').toLowerCase();
	const results = PLACES.filter((p) => p.name.toLowerCase().startsWith(name.slice(0, 4)));
	res.writeHead(200, { 'content-type': 'application/json' });
	res.end(JSON.stringify(url.pathname === '/v1/search' && results.length ? { results } : {}));
}).listen(Number(process.argv[2] ?? 4176));
