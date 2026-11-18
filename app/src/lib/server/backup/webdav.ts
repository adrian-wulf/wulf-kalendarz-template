import { appFetch } from '../net.js';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { t } from '#lib/i18n/index.js';

/**
 * Prosty klient WebDAV (Nextcloud, ownCloud, Synology/QNAP WebDAV Server, Apache mod_dav):
 * PUT do pliku tymczasowego i MOVE na nazwę docelową, PROPFIND (lista), GET, DELETE, MKCOL.
 * Logowanie Basic – hasło aplikacji z panelu (tabela `secrets`, nigdy w przeglądarce).
 *
 * Small WebDAV client used for off-device backups. Uploads go to `<name>.part` and are moved into
 * place, so a broken upload never looks like a finished backup.
 */

export interface WebdavAuth {
	/** adres katalogu kopii, np. https://cloud.example.com/remote.php/dav/files/ania/Kopie/kalendarz/ */
	url: string;
	user: string;
	password: string;
}

export interface RemoteFile {
	name: string;
	size: number;
	modified: string | null;
}

export class WebdavError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
	}
}

const TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 30 * 60_000;

export function folderUrl(url: string): URL {
	const u = new URL(url);
	if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new WebdavError(t('p4.dav.protocol'));
	if (u.username || u.password) throw new WebdavError(t('p4.dav.credsInUrl'));
	if (!u.pathname.endsWith('/')) u.pathname += '/';
	u.search = '';
	u.hash = '';
	return u;
}

export class Webdav {
	private base: URL;
	private auth: string;
	constructor(
		a: WebdavAuth,
		private f: typeof fetch = appFetch
	) {
		this.base = folderUrl(a.url);
		this.auth = 'Basic ' + Buffer.from(`${a.user}:${a.password}`).toString('base64');
	}

	private fileUrl(name: string) {
		if (!/^[\w.-]+$/.test(name)) throw new WebdavError(t('p4.dav.badName', { name }));
		return new URL(encodeURIComponent(name), this.base);
	}

	private async req(method: string, url: URL, init: RequestInit & { headers?: Record<string, string> } = {}, timeout = TIMEOUT) {
		let res: Response;
		try {
			res = await this.f(url, {
				...init,
				method,
				headers: { authorization: this.auth, ...init.headers },
				redirect: 'manual',
				signal: AbortSignal.timeout(timeout)
			});
		} catch (e) {
			const cause = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e);
			throw new WebdavError(t('p4.dav.unreachable', { error: cause }));
		}
		return res;
	}

	private fail(res: Response, what: 'folder' | 'mkcol' | 'list' | 'upload' | 'move' | 'download' | 'delete'): never {
		const hint =
			res.status === 401
				? t('p4.dav.h401')
				: res.status === 403
					? t('p4.dav.h403')
					: res.status === 404 || res.status === 409
						? t('p4.dav.h404')
						: res.status === 507
							? t('p4.dav.h507')
							: res.status >= 300 && res.status < 400
								? t('p4.dav.hRedirect', { location: res.headers.get('location') ?? '?' })
								: res.statusText || t('p4.dav.hOther');
		throw new WebdavError(`${t(`p4.dav.w.${what}`)}: HTTP ${res.status} – ${hint}`, res.status);
	}

	/** Sprawdza katalog; nieistniejący zakłada (także brakujące katalogi nadrzędne w obrębie adresu). */
	async ensureFolder(): Promise<void> {
		const r = await this.req('PROPFIND', this.base, { headers: { depth: '0' } });
		await r.body?.cancel();
		if (r.status === 207 || r.status === 200) return;
		if (r.status !== 404) this.fail(r, 'folder');
		const parts = this.base.pathname.split('/').filter(Boolean);
		// Od najgłębszego w górę szukamy istniejącego, potem zakładamy w dół.
		let i = parts.length;
		const at = (n: number) => new URL('/' + parts.slice(0, n).join('/') + '/', this.base);
		while (i > 0) {
			const m = await this.req('MKCOL', at(i));
			await m.body?.cancel();
			if (m.status === 201 || m.status === 405) break;
			if (m.status !== 409) this.fail(m, 'mkcol');
			i--;
		}
		for (let n = i + 1; n <= parts.length; n++) {
			const m = await this.req('MKCOL', at(n));
			await m.body?.cancel();
			if (m.status !== 201 && m.status !== 405) this.fail(m, 'mkcol');
		}
	}

	async list(): Promise<RemoteFile[]> {
		const body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>';
		const r = await this.req('PROPFIND', this.base, { headers: { depth: '1', 'content-type': 'application/xml' }, body });
		if (r.status !== 207) this.fail(r, 'list');
		return parseMultistatus(await r.text(), this.base);
	}

	async upload(name: string, file: string): Promise<void> {
		const size = (await stat(file)).size;
		const part = this.fileUrl(`${name}.part`);
		const put = await this.req(
			'PUT',
			part,
			{
				headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
				body: Readable.toWeb(createReadStream(file)) as ReadableStream,
				duplex: 'half'
			} as RequestInit & { headers: Record<string, string> },
			UPLOAD_TIMEOUT
		);
		await put.body?.cancel();
		if (put.status !== 201 && put.status !== 204 && put.status !== 200) this.fail(put, 'upload');
		const mv = await this.req('MOVE', part, { headers: { destination: this.fileUrl(name).href, overwrite: 'T' } });
		await mv.body?.cancel();
		if (mv.status !== 201 && mv.status !== 204) {
			await this.remove(`${name}.part`).catch(() => {});
			this.fail(mv, 'move');
		}
	}

	async download(name: string, to: string): Promise<void> {
		const r = await this.req('GET', this.fileUrl(name), {}, UPLOAD_TIMEOUT);
		if (r.status !== 200 || !r.body) this.fail(r, 'download');
		await pipeline(Readable.fromWeb(r.body as never), createWriteStream(to));
	}

	async remove(name: string): Promise<void> {
		const r = await this.req('DELETE', this.fileUrl(name));
		await r.body?.cancel();
		if (r.status !== 204 && r.status !== 200 && r.status !== 404) this.fail(r, 'delete');
	}
}

const decode = (s: string) =>
	s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e: string) =>
		e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCharCode(Number(e.slice(1)))
	);

/** Pliki z odpowiedzi PROPFIND (bez samego katalogu i podkatalogów). Prefiksy przestrzeni nazw dowolne. */
export function parseMultistatus(xml: string, base: URL): RemoteFile[] {
	const tag = (block: string, name: string) => block.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${name}>`, 'i'))?.[1];
	const out: RemoteFile[] = [];
	for (const block of xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1)) {
		const href = tag(block, 'href');
		if (!href) continue;
		if (/<(?:[\w-]+:)?collection\s*\/?>/i.test(block)) continue;
		const path = new URL(decode(href), base).pathname;
		if (path.endsWith('/')) continue;
		const name = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
		const size = Number(tag(block, 'getcontentlength') ?? 0);
		const lm = tag(block, 'getlastmodified');
		out.push({ name, size, modified: lm && !Number.isNaN(Date.parse(lm)) ? new Date(lm).toISOString() : null });
	}
	return out;
}
