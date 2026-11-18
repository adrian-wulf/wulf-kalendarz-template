/**
 * Minimalny tar (ustar): tylko zwykłe pliki, nazwy do 100 bajtów. Wystarcza na archiwum kopii
 * (manifest, baza, zdjęcia) bez zależności. Odczyt jest strumieniowy – pliki trafiają od razu
 * na dysk, cała kopia nigdy nie leży w pamięci.
 *
 * Minimal ustar writer/reader (regular files only, names up to 100 bytes), streaming both ways.
 */

const BLOCK = 512;

export interface TarEntry {
	name: string;
	size: number;
	mtime?: Date;
	/** Zawartość: bufor albo strumień kawałków (np. `createReadStream`). */
	body: Uint8Array | AsyncIterable<Uint8Array>;
}

function octal(n: number, len: number) {
	return n.toString(8).padStart(len - 1, '0') + '\0';
}

export function tarHeader(name: string, size: number, mtime = new Date()): Buffer {
	const nameBytes = Buffer.from(name, 'utf8');
	if (nameBytes.length > 100) throw new Error(`tar: nazwa za długa: ${name}`);
	if (size > 0o77777777777) throw new Error(`tar: plik za duży: ${name}`);
	const h = Buffer.alloc(BLOCK);
	nameBytes.copy(h, 0);
	h.write(octal(0o644, 8), 100, 'ascii');
	h.write(octal(0, 8), 108, 'ascii');
	h.write(octal(0, 8), 116, 'ascii');
	h.write(octal(size, 12), 124, 'ascii');
	h.write(octal(Math.floor(mtime.getTime() / 1000), 12), 136, 'ascii');
	h.write('        ', 148, 'ascii'); // suma kontrolna liczona ze spacjami w jej miejscu
	h.write('0', 156, 'ascii');
	h.write('ustar\0' + '00', 257, 'ascii');
	let sum = 0;
	for (const b of h) sum += b;
	h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
	return h;
}

/** Strumień bajtów archiwum z listy plików (do `pipeline` z gzip). */
export async function* tarStream(entries: Iterable<TarEntry> | AsyncIterable<TarEntry>): AsyncGenerator<Buffer> {
	for await (const e of entries) {
		yield tarHeader(e.name, e.size, e.mtime);
		let written = 0;
		if (e.body instanceof Uint8Array) {
			written = e.body.length;
			yield Buffer.from(e.body);
		} else
			for await (const c of e.body) {
				written += c.length;
				yield Buffer.from(c);
			}
		if (written !== e.size) throw new Error(`tar: ${e.name} zmienił rozmiar podczas kopii (${e.size} → ${written})`);
		const pad = (BLOCK - (e.size % BLOCK)) % BLOCK;
		if (pad) yield Buffer.alloc(pad);
	}
	yield Buffer.alloc(BLOCK * 2);
}

function parseOctal(b: Buffer) {
	const s = b.toString('ascii').replace(/\0.*$/s, '').trim();
	if (!/^[0-7]*$/.test(s)) throw new Error('tar: uszkodzony nagłówek');
	return s ? parseInt(s, 8) : 0;
}

/** Bufor czytany „po kawałku” z iteratora strumienia. */
class Pull {
	private chunks: Buffer[] = [];
	private len = 0;
	constructor(private it: AsyncIterator<Uint8Array>) {}
	async fill(n: number) {
		while (this.len < n) {
			const r = await this.it.next();
			if (r.done) return false;
			const b = Buffer.from(r.value);
			this.chunks.push(b);
			this.len += b.length;
		}
		return true;
	}
	take(n: number): Buffer {
		const all = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
		const out = all.subarray(0, n);
		const rest = all.subarray(n);
		this.chunks = rest.length ? [rest] : [];
		this.len = rest.length;
		return out;
	}
	get available() {
		return this.len;
	}
}

export interface TarFileHeader {
	name: string;
	size: number;
}

/**
 * Czyta archiwum; dla każdego pliku woła `onFile`, które zwraca funkcję zapisu kawałka
 * (albo rzuca błąd, gdy plik jest nieoczekiwany). Inne typy wpisów niż zwykły plik → błąd.
 */
export async function readTar(
	source: AsyncIterable<Uint8Array>,
	onFile: (h: TarFileHeader) => Promise<{ write: (chunk: Buffer) => Promise<void>; close: () => Promise<void> }>
): Promise<void> {
	const p = new Pull(source[Symbol.asyncIterator]());
	for (;;) {
		if (!(await p.fill(BLOCK))) throw new Error('tar: archiwum urwane');
		const h = p.take(BLOCK);
		if (h.every((b) => b === 0)) {
			// Koniec archiwum – reszta (wypełnienie zerami) do końca, żeby strumień się domknął
			// (i odszyfrowanie sprawdziło znacznik GCM).
			while (await p.fill(p.available + 1)) p.take(p.available);
			return;
		}
		let sum = 0;
		for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
		if (sum !== parseOctal(h.subarray(148, 156))) throw new Error('tar: zła suma kontrolna nagłówka');
		const type = String.fromCharCode(h[156]);
		if (type !== '0' && type !== '\0') throw new Error('tar: nieobsługiwany typ wpisu');
		const prefix = h.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
		const base = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
		const name = prefix ? `${prefix}/${base}` : base;
		const size = parseOctal(h.subarray(124, 136));
		const out = await onFile({ name, size });
		let left = size;
		try {
			while (left > 0) {
				if (!(await p.fill(1))) throw new Error('tar: archiwum urwane');
				const c = p.take(Math.min(left, p.available));
				left -= c.length;
				await out.write(c);
			}
		} finally {
			await out.close();
		}
		const pad = (BLOCK - (size % BLOCK)) % BLOCK;
		if (pad) {
			if (!(await p.fill(pad))) throw new Error('tar: archiwum urwane');
			p.take(pad);
		}
	}
}
