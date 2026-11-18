// @ts-nocheck – atrapa testowa; typy sprawdza użycie w backup.test.ts
// Atrapa serwera WebDAV (jak Nextcloud) w pamięci – testy jednostkowe kopii i e2e. Port z argumentu.
// Fake in-memory WebDAV server: PROPFIND (depth 0/1), MKCOL, PUT, GET, MOVE, DELETE, Basic auth.
// Usage: `node e2e/webdav-mock.mjs 4820` or `startWebdav({ port: 0 })` from a test.
import { createServer } from 'node:http';

export const USER = 'kalendarz';
export const PASSWORD = 'app-password-123';

/** @param {{ port?: number, user?: string, password?: string }} [o] */
export function startWebdav(o = {}) {
	const user = o.user ?? USER;
	const password = o.password ?? PASSWORD;
	/** @type {Map<string, Buffer>} */
	const files = new Map();
	/** @type {Set<string>} */
	const dirs = new Set(['/']);
	const log = [];
	const parent = (p) => p.replace(/[^/]+\/?$/, '') || '/';

	const server = createServer(async (req, res) => {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const body = Buffer.concat(chunks);
		const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		log.push(`${req.method} ${path}`);
		const auth = req.headers.authorization ?? '';
		if (auth !== 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')) {
			res.writeHead(401, { 'www-authenticate': 'Basic realm="mock"' });
			return res.end();
		}
		const dirPath = path.endsWith('/') ? path : path + '/';
		switch (req.method) {
			case 'PROPFIND': {
				if (!dirs.has(dirPath) && !files.has(path)) return res.writeHead(404).end();
				const entry = (href, size, isDir) =>
					`<d:response><d:href>${encodeURI(href)}</d:href><d:propstat><d:prop>` +
					(isDir ? '<d:resourcetype><d:collection/></d:resourcetype>' : `<d:resourcetype/><d:getcontentlength>${size}</d:getcontentlength>`) +
					`<d:getlastmodified>${new Date().toUTCString()}</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
				let xml = '';
				if (files.has(path)) xml = entry(path, files.get(path).length, false);
				else {
					xml = entry(dirPath, 0, true);
					if (req.headers.depth === '1') {
						for (const [p, b] of files) if (parent(p) === dirPath) xml += entry(p, b.length, false);
						for (const d of dirs) if (d !== dirPath && parent(d) === dirPath) xml += entry(d, 0, true);
					}
				}
				res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' });
				return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${xml}</d:multistatus>`);
			}
			case 'MKCOL':
				if (dirs.has(dirPath)) return res.writeHead(405).end();
				if (!dirs.has(parent(dirPath))) return res.writeHead(409).end();
				dirs.add(dirPath);
				return res.writeHead(201).end();
			case 'PUT':
				if (!dirs.has(parent(path))) return res.writeHead(409).end();
				if (req.headers['content-length'] !== undefined && Number(req.headers['content-length']) !== body.length) return res.writeHead(400).end();
				files.set(path, body);
				return res.writeHead(201).end();
			case 'GET':
				if (!files.has(path)) return res.writeHead(404).end();
				res.writeHead(200, { 'content-type': 'application/octet-stream' });
				return res.end(files.get(path));
			case 'MOVE': {
				const dest = decodeURIComponent(new URL(String(req.headers.destination)).pathname);
				if (!files.has(path)) return res.writeHead(404).end();
				const existed = files.has(dest);
				files.set(dest, files.get(path));
				files.delete(path);
				return res.writeHead(existed ? 204 : 201).end();
			}
			case 'DELETE':
				if (!files.delete(path)) return res.writeHead(404).end();
				return res.writeHead(204).end();
			default:
				return res.writeHead(405).end();
		}
	});
	return new Promise((resolve) =>
		server.listen(o.port ?? 0, '127.0.0.1', () => {
			const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
			resolve({ port, url: `http://127.0.0.1:${port}`, files, dirs, log, close: () => new Promise((r) => server.close(r)) });
		})
	);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
	const port = Number(process.argv[2] ?? 4820);
	const s = await startWebdav({ port });
	console.log(`WebDAV mock on ${s.url} (${USER} / ${PASSWORD})`);
}
