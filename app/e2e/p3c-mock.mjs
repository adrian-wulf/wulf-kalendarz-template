// Atrapy dla testów e2e modułów odjazdów i Home Assistanta (bez sieci). Port z argumentu.
// - HAFAS REST (jak v6.vbb.transport.rest): /locations, /stops/:id/departures – czasy względem „teraz”
// - GTFS: /gtfs.zip (plik z testów jednostkowych)
// - Home Assistant: /api/states, /api/services/:domain/toggle, /api/camera_proxy/:id (Bearer e2e-ha-token)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const TOKEN = 'e2e-ha-token';
const GTFS = readFileSync(new URL('../src/lib/server/sources/fixtures/gtfs-mini.zip', import.meta.url));

const STOPS = [
	{ type: 'stop', id: '900003201', name: 'S+U Berlin Hauptbahnhof', products: { suburban: true, subway: true, bus: true } },
	{ type: 'stop', id: '900100003', name: 'S+U Alexanderplatz Bhf (Berlin)', products: { suburban: true, tram: true } }
];

function departures() {
	const now = Date.now();
	const at = (min) => new Date(Math.floor(now / 60_000) * 60_000 + min * 60_000).toISOString();
	const dep = (id, line, product, color, direction, min, delayMin, cancelled = false) => ({
		tripId: id,
		when: cancelled ? null : at(min + delayMin),
		plannedWhen: at(min),
		delay: cancelled ? null : delayMin * 60,
		platform: '2',
		direction,
		cancelled: cancelled || undefined,
		line: { type: 'line', id, name: line, product, color: color ? { fg: '#fff', bg: color } : undefined }
	});
	return {
		departures: [
			dep('t1', 'S5', 'suburban', '#EB7405', 'Strausberg Nord', 2, 0),
			dep('t2', 'U5', 'subway', '#7E5330', 'Hönow', 4, 2),
			dep('t3', 'M10', 'tram', '#CA1214', 'Warschauer Straße', 7, 0),
			dep('t4', 'TXL', 'bus', '#A5027D', 'Flughafen BER', 11, 5),
			dep('t5', 'RE1', 'regional', '#E30613', 'Frankfurt (Oder)', 15, 0, true),
			dep('t6', '245', 'bus', '#A5027D', 'Nordbahnhof', 19, 0)
		]
	};
}

// --- Home Assistant ---
const states = new Map(
	[
		['sensor.salon_temperatura', '21.4', { friendly_name: 'Salon', unit_of_measurement: '°C', device_class: 'temperature' }],
		['sensor.wilgotnosc', '48', { friendly_name: 'Wilgotność', unit_of_measurement: '%' }],
		['light.kuchnia', 'off', { friendly_name: 'Kuchnia' }],
		['light.salon', 'on', { friendly_name: 'Salon – lampa' }],
		['switch.choinka', 'off', { friendly_name: 'Choinka' }],
		['lock.drzwi', 'locked', { friendly_name: 'Drzwi wejściowe' }],
		['binary_sensor.okno', 'off', { friendly_name: 'Okno sypialnia' }],
		['camera.wejscie', 'idle', { friendly_name: 'Wejście' }],
		['automation.noc', 'on', { friendly_name: 'Tryb nocny' }]
	].map(([entity_id, state, attributes]) => [entity_id, { entity_id, state, attributes }])
);

/** Mały PNG „z kamery” (gradient + jaśniejszy prostokąt drzwi), bez zależności. */
function png(w, h, tick) {
	const rows = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) {
		rows[y * (w * 3 + 1)] = 0;
		for (let x = 0; x < w; x++) {
			const door = x > w * 0.42 && x < w * 0.58 && y > h * 0.25;
			const g = 40 + Math.round((y / h) * 60) + ((x + tick) % 97 === 0 ? 30 : 0);
			const o = y * (w * 3 + 1) + 1 + x * 3;
			rows[o] = door ? 150 : g;
			rows[o + 1] = door ? 120 : g + 8;
			rows[o + 2] = door ? 90 : g + 22;
		}
	}
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(td));
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const send = (res, status, body, type = 'application/json') => {
	res.writeHead(status, { 'content-type': type });
	res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const p = url.pathname;
	if (p === '/locations') {
		const q = (url.searchParams.get('query') ?? '').toLowerCase();
		return send(res, 200, STOPS.filter((s) => s.name.toLowerCase().includes(q)));
	}
	if (/^\/stops\/[^/]+\/departures$/.test(p)) return send(res, 200, departures());
	if (p === '/gtfs.zip') return send(res, 200, GTFS, 'application/zip');
	if (p.startsWith('/api/')) {
		if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: 'Unauthorized' });
		if (p === '/api/states') return send(res, 200, [...states.values()]);
		const svc = /^\/api\/services\/(\w+)\/toggle$/.exec(p);
		if (svc && req.method === 'POST') {
			let body = '';
			req.on('data', (c) => (body += c));
			req.on('end', () => {
				const s = states.get(JSON.parse(body || '{}').entity_id);
				if (s) s.state = s.state === 'on' ? 'off' : 'on';
				send(res, 200, s ? [s] : []);
			});
			return;
		}
		if (p === '/api/camera_proxy/camera.wejscie') return send(res, 200, png(320, 180, Math.floor(Date.now() / 1000)), 'image/png');
	}
	send(res, 404, { message: 'not found' });
}).listen(Number(process.argv[2] ?? 4183));
