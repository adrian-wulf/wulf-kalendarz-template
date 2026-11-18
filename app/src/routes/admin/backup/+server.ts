import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.js';
import { archiveForDownload, exclusive, sameOriginRequest } from '#lib/server/backup.js';
import { InputError } from '#lib/server/store.js';
import { t } from '#lib/i18n/index.js';

/** Świeża kopia do pobrania: archiwum z bazą, zdjęciami i manifestem (zaszyfrowane, gdy jest hasło). */
async function download(event: RequestEvent) {
	if (!sameOriginRequest(event.request.headers, event.url.origin)) error(403, t('p4.backup.err.crossSite'));
	let made: { file: string; name: string };
	try {
		// Jedno archiwum naraz (i nie w trakcie kopii albo przywracania).
		made = await exclusive('download', () => archiveForDownload(getDb()));
	} catch (e) {
		if (e instanceof InputError) error(409, e.message);
		throw e;
	}
	const { file, name } = made;
	const size = (await stat(file)).size;
	const stream = createReadStream(file);
	stream.on('close', () => void rm(file, { force: true }));
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: {
			'content-type': name.endsWith('.enc') ? 'application/octet-stream' : 'application/gzip',
			'content-length': String(size),
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'no-store'
		}
	});
}

export const GET = download;
export const POST = download;
