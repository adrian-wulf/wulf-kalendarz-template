import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from './db/index';
import { secrets } from './db/schema';
import {
	cameraSnapshot,
	canToggle,
	fetchStates,
	haPublic,
	haSource,
	haTile,
	HaError,
	normalizeUrl,
	pickableEntities,
	saveEntities,
	saveHaAuth,
	toggleEntity,
	viewOf
} from './homeassistant';
import { refresh, setSetting } from './sync';
import { buildDashboard } from './dashboard';

/** Atrapa Home Assistanta na losowym porcie (bez sieci): REST API ze stanami, usługami i kamerą. */
const TOKEN = 'llat-secret-token-1234';
const calls: { method: string; url: string; body: string; auth: string | undefined }[] = [];
const states = [
	{ entity_id: 'sensor.salon_temp', state: '21.46', attributes: { friendly_name: 'Salon', unit_of_measurement: '°C' } },
	{ entity_id: 'light.kuchnia', state: 'off', attributes: { friendly_name: 'Kuchnia' } },
	{ entity_id: 'switch.choinka', state: 'on', attributes: { friendly_name: 'Choinka' } },
	{ entity_id: 'lock.drzwi', state: 'unlocked', attributes: { friendly_name: 'Drzwi wejściowe' } },
	{ entity_id: 'camera.wejscie', state: 'idle', attributes: { friendly_name: 'Wejście' } },
	{ entity_id: 'camera.svg', state: 'idle', attributes: {} },
	{ entity_id: 'automation.noc', state: 'on', attributes: { friendly_name: 'Noc' } }
];
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
let server: Server;
let url: string;

const body = (req: IncomingMessage) => new Promise<string>((r) => {
	let s = '';
	req.on('data', (c) => (s += c));
	req.on('end', () => r(s));
});

beforeAll(async () => {
	server = createServer(async (req, res) => {
		calls.push({ method: req.method!, url: req.url!, body: await body(req), auth: req.headers.authorization });
		if (req.headers.authorization !== `Bearer ${TOKEN}`) return void res.writeHead(401).end();
		if (req.url === '/api/states') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(states));
		if (req.method === 'POST' && req.url?.startsWith('/api/services/')) return void res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
		if (req.url === '/api/camera_proxy/camera.svg') return void res.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg onload="alert(1)"/>');
		if (req.url === '/api/camera_proxy/camera.wejscie') return void res.writeHead(200, { 'content-type': 'image/jpeg' }).end(JPEG);
		res.writeHead(404).end();
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function connected(entities = ['sensor.salon_temp', 'light.kuchnia', 'lock.drzwi', 'camera.wejscie', 'camera.svg']) {
	const db = openDb(':memory:');
	const f = new FormData();
	f.set('url', `${url}/`);
	f.set('token', TOKEN);
	saveHaAuth(db, f);
	const e = new FormData();
	for (const id of entities) e.append('entity', id);
	e.set('label:light.kuchnia', 'Światło w kuchni');
	saveEntities(db, e);
	setSetting(db, 'modules', { homeassistant: { enabled: true } });
	return db;
}

describe('Home Assistant – token i adres', () => {
	it('adres bez końcowego „/”, tylko http(s), bez loginu w adresie', () => {
		expect(normalizeUrl('http://ha.local:8123/')).toBe('http://ha.local:8123');
		expect(() => normalizeUrl('ftp://ha.local')).toThrow();
		expect(() => normalizeUrl('http://user:pass@ha.local')).toThrow();
	});

	it('token zostaje w secrets: panel widzi tylko końcówkę, puste pole nie kasuje tokenu', () => {
		const db = connected();
		expect(haPublic(db)).toEqual({ url, tokenHint: '…1234' });
		const f = new FormData();
		f.set('url', url);
		f.set('token', '');
		saveHaAuth(db, f);
		expect(JSON.parse(db.select().from(secrets).all()[0].value)).toEqual({ url, token: TOKEN });
	});

	it('token nie trafia do danych kiosku', async () => {
		const db = connected();
		await refresh(db, haSource(db)!);
		const dash = buildDashboard(db, new Date());
		const text = JSON.stringify(dash);
		expect(text).not.toContain(TOKEN);
		expect(text).not.toContain(url); // adres HA też nie
		expect(dash.modules.homeassistant?.entities.length).toBe(3);
	});
});

describe('Home Assistant – REST przez serwer (atrapa HA)', () => {
	it('stany: Bearer token, w pamięci podręcznej tylko wybrane encje', async () => {
		const db = connected();
		calls.length = 0;
		await refresh(db, haSource(db)!);
		expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/states', auth: `Bearer ${TOKEN}` });
		const tile = haTile(db).data;
		expect(tile.entities.map((e) => [e.entityId, e.label, e.state, e.toggle])).toEqual([
			['sensor.salon_temp', 'Salon', '21,5 °C', false],
			['light.kuchnia', 'Światło w kuchni', 'wyłączone', true],
			['lock.drzwi', 'Drzwi wejściowe', 'otwarte', false]
		]);
		expect(tile.cameras.map((c) => c.label)).toEqual(['Wejście', 'camera.svg']);
	});

	it('przełączanie: tylko wybrane światło/gniazdko; zamek i obce encje odrzucone', async () => {
		const db = connected();
		calls.length = 0;
		await toggleEntity(db, 'light.kuchnia');
		expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/services/light/toggle', body: '{"entity_id":"light.kuchnia"}' });
		await expect(toggleEntity(db, 'lock.drzwi')).rejects.toThrow(/nie można przełączać/);
		await expect(toggleEntity(db, 'switch.choinka')).rejects.toThrow(/nie wybrano/); // nie wybrana w panelu
		await expect(toggleEntity(db, '../../api/config')).rejects.toThrow();
		// wyłączone w ustawieniach modułu
		setSetting(db, 'modules', { homeassistant: { enabled: true, config: { allowToggle: false } } });
		await expect(toggleEntity(db, 'light.kuchnia')).rejects.toThrow(/nie można przełączać/);
		expect(calls).toHaveLength(1);
		expect(canToggle('lock.drzwi')).toBe(false);
	});

	it('kamera przez proxy: obraz z HA, tylko wybrane kamery', async () => {
		const db = connected();
		const img = await cameraSnapshot(db, 'camera.wejscie');
		expect(img.type).toBe('image/jpeg');
		expect(Buffer.from(img.body)).toEqual(JPEG);
		await expect(cameraSnapshot(db, 'light.kuchnia')).rejects.toThrow();
		await expect(cameraSnapshot(db, 'camera.ogrod')).rejects.toThrow();
		// SVG mógłby wykonać skrypt pod adresem kalendarza – tylko obrazy rastrowe
		await expect(cameraSnapshot(db, 'camera.svg')).rejects.toThrow(/obrazu/);
	});

	it('zły token → czytelny błąd; HA niedostępny → błąd z przyczyną', async () => {
		await expect(fetchStates(fetch, { url, token: 'zly' })).rejects.toThrow(/odrzucił token/);
		await expect(fetchStates(fetch, { url: 'http://127.0.0.1:9', token: TOKEN })).rejects.toBeInstanceOf(HaError);
	});

	it('lista do wyboru w panelu: tylko obsługiwane domeny', async () => {
		const db = connected();
		const list = await pickableEntities(db);
		expect(list.map((e) => e.entityId)).toEqual(['camera.svg', 'camera.wejscie', 'light.kuchnia', 'lock.drzwi', 'sensor.salon_temp', 'switch.choinka']);
	});

	it('widok stanu: niedostępne, zamek, czujnik bez liczby', () => {
		expect(viewOf(undefined, 'light.x', '')).toMatchObject({ unavailable: true, toggle: false, label: 'light.x' });
		expect(viewOf({ entity_id: 'lock.d', state: 'locked', attributes: {} }, 'lock.d', 'Drzwi')).toMatchObject({ active: true, state: 'zamknięte' });
		expect(viewOf({ entity_id: 'sensor.s', state: 'dry', attributes: {} }, 'sensor.s', 'S').state).toBe('dry');
	});
});
