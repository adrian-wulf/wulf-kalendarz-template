import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { InputError } from './store.js';
import { t } from '#lib/i18n/index.js';

/**
 * Zdjęcia na woluminie danych obok bazy: `<katalog bazy>/media/photos` (wygaszacz)
 * i `media/avatars` (domownicy). Panel zmniejsza zdjęcia w przeglądarce przed wysłaniem
 * (bez natywnych zależności w obrazie Dockera), serwer sprawdza tylko format i rozmiar.
 * Pliki serwuje `/media/<rodzaj>/<plik>` (routes/media).
 */

export type MediaKind = 'photos' | 'avatars';
export const MEDIA_KINDS: readonly MediaKind[] = ['photos', 'avatars'];

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
type Ext = keyof typeof TYPES;

/** Nazwa pliku, jaką sami nadajemy – nic innego nie jest serwowane ani usuwane. */
export const FILE = /^[a-z0-9-]{1,80}\.(jpg|png|webp)$/;

/** Górna granica jednego pliku (po zmniejszeniu w przeglądarce zwykle 0,2–0,8 MB). */
export const MAX_BYTES: Record<MediaKind, number> = { photos: 8 * 1024 * 1024, avatars: 2 * 1024 * 1024 };

export const MAX_PHOTOS = 300;

export function mediaRoot(): string {
	if (process.env.MEDIA_DIR) return resolve(process.env.MEDIA_DIR);
	return join(dirname(resolve(process.env.DATABASE_PATH ?? 'data/kalendarz.db')), 'media');
}

const dir = (kind: MediaKind) => join(mediaRoot(), kind);

/** Format po pierwszych bajtach (nie po nazwie ani typie z przeglądarki). */
export function sniff(b: Uint8Array): Ext | null {
	if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
	if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
	return null;
}

/** Zapisuje obraz z formularza; zwraca nazwę pliku. `prefix` – np. identyfikator domownika. */
export async function saveImage(kind: MediaKind, file: unknown, prefix = ''): Promise<string> {
	if (!(file instanceof Blob) || file.size === 0) throw new InputError(t('p3a.media.err.noFile'));
	if (file.size > MAX_BYTES[kind]) throw new InputError(t('p3a.media.err.tooBig', { mb: MAX_BYTES[kind] / 1024 / 1024 }));
	const bytes = new Uint8Array(await file.arrayBuffer());
	const ext = sniff(bytes);
	if (!ext) throw new InputError(t('p3a.media.err.format'));
	const safe = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
	const name = `${safe ? `${safe}-` : ''}${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
	mkdirSync(dir(kind), { recursive: true });
	writeFileSync(join(dir(kind), name), bytes);
	return name;
}

export const mediaUrl = (kind: MediaKind, file: string) => `/media/${kind}/${file}`;

/** Plik do wysłania przeglądarce; nieznany rodzaj, zła nazwa albo brak pliku → null. */
export function readMedia(kind: string, file: string): { data: Buffer; type: string } | null {
	if (!MEDIA_KINDS.includes(kind as MediaKind) || !FILE.test(file)) return null;
	try {
		return { data: readFileSync(join(dir(kind as MediaKind), file)), type: TYPES[file.split('.').pop() as Ext] };
	} catch {
		return null;
	}
}

export function removeMedia(kind: MediaKind, file: string) {
	if (FILE.test(file)) rmSync(join(dir(kind), file), { force: true });
}

/** Usuwa plik wskazany adresem `/media/<rodzaj>/<plik>` (np. stary awatar). */
export function removeByUrl(url: string | null | undefined) {
	const m = url?.match(/^\/media\/(photos|avatars)\/([^/]+)$/);
	if (m) removeMedia(m[1] as MediaKind, m[2]);
}

export interface Photo {
	file: string;
	url: string;
	size: number;
}

/** Zdjęcia wygaszacza w kolejności dodania (nazwa zaczyna się od znacznika czasu). */
export function listPhotos(): Photo[] {
	let files: string[];
	try {
		files = readdirSync(dir('photos'));
	} catch {
		return [];
	}
	return files
		.filter((f) => FILE.test(f))
		.sort()
		.map((file) => ({ file, url: mediaUrl('photos', file), size: statSync(join(dir('photos'), file)).size }));
}
