/**
 * Start aplikacji w produkcji: `node server` (po `npm run build`).
 * Zamiast `node build` – ten sam handler adapter-node, plus TRUSTED_ORIGINS w czasie działania
 * (opis w server/origin.js). Zmienne: HOST, PORT, TRUSTED_ORIGINS (patrz .env.example).
 *
 * Production entry point: same adapter-node handler as `node build`, plus runtime TRUSTED_ORIGINS.
 */
import http from 'node:http';
import process from 'node:process';
import { HOST_HEADER, PROTO_HEADER, applyTrustedOrigin, trustedOrigins } from './origin.js';

if (process.env.ORIGIN) {
	console.warn('ORIGIN jest ustawione – adapter-node użyje go dla wszystkich żądań, TRUSTED_ORIGINS nie zadziała.');
}
// adapter-node czyta te zmienne przy imporcie handlera, więc ustawiamy je przed importem.
process.env.PROTOCOL_HEADER = PROTO_HEADER;
process.env.HOST_HEADER = HOST_HEADER;
// Zdjęcia z panelu (wygaszacz, awatary) są większe niż domyślne 512 KB adaptera.
process.env.BODY_SIZE_LIMIT ||= '12M';
const { handler } = await import('../build/handler.js');

const { origins, invalid } = trustedOrigins(process.env);
if (invalid.length) console.warn(`TRUSTED_ORIGINS: pomijam niepoprawne wpisy: ${invalid.join(', ')}`);

// Domyślnie tylko localhost: `npm start` nie wystawia aplikacji w LAN. Obraz Dockera ustawia HOST=0.0.0.0
// (w kontenerze port i tak jest opublikowany tylko na 127.0.0.1 hosta – compose.yaml).
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
	applyTrustedOrigin(req.headers, origins);
	handler(req, res, () => {
		res.statusCode = 404;
		res.end();
	});
});

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}` + (origins.size ? ` (trusted origins: ${[...origins].join(', ')})` : ''));
});

function shutdown() {
	server.close(() => process.exit(0));
	server.closeIdleConnections();
	setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
