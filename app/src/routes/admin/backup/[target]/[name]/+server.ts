import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { getDb } from '#lib/server/db/index.js';
import { localFile } from '#lib/server/backup.js';
import { t } from '#lib/i18n/index.js';

/** Pobranie kopii z miejsca lokalnego (tylko nazwy plików kopii z listy). */
export async function GET({ params }) {
	const file = localFile(getDb(), params.target, params.name);
	const size = file ? await stat(file).then((s) => (s.isFile() ? s.size : null), () => null) : null;
	if (!file || size === null) error(404, t('error.notFound'));
	return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(size),
			'content-disposition': `attachment; filename="${params.name}"`
		}
	});
}
