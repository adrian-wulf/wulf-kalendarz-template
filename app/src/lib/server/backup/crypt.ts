import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';

/**
 * Szyfrowanie kopii hasłem: AES-256-GCM, klucz z hasła przez scrypt (sól w pliku).
 * Plik: MAGIC (8) | wersja (1) | sól (16) | IV (12) | szyfrogram | znacznik GCM (16).
 *
 * Passphrase encryption: AES-256-GCM, key derived with scrypt. The GCM tag sits at the end of the
 * file, so decryption reads it first and only trusts the plaintext after `final()` succeeds.
 */

export const MAGIC = Buffer.from('WKBAKENC', 'ascii');
const VERSION = 1;
const HEADER = MAGIC.length + 1 + 16 + 12;
const TAG = 16;

export class PassphraseError extends Error {}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
	return new Promise((res, rej) =>
		scrypt(passphrase.normalize('NFC'), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? rej(err) : res(key)))
	);
}

/** Krok `pipeline`: szyfruje strumień (nagłówek, szyfrogram, znacznik). */
export async function encryptor(passphrase: string) {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = await deriveKey(passphrase, salt);
	return async function* (source: AsyncIterable<Buffer>) {
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		yield Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);
		for await (const c of source) yield cipher.update(c);
		yield cipher.final();
		yield cipher.getAuthTag();
	};
}

/** Czy plik zaczyna się od nagłówka zaszyfrowanej kopii. */
export async function isEncrypted(file: string): Promise<boolean> {
	const fh = await open(file, 'r');
	try {
		const b = Buffer.alloc(MAGIC.length);
		await fh.read(b, 0, b.length, 0);
		return b.equals(MAGIC);
	} finally {
		await fh.close();
	}
}

/**
 * Odszyfrowany strumień pliku. Złe hasło albo zmieniony plik → `PassphraseError` na końcu
 * strumienia (GCM sprawdza znacznik dopiero w `final()`), więc wynik wolno użyć dopiero po nim.
 */
export async function decryptFile(file: string, passphrase: string): Promise<AsyncIterable<Buffer>> {
	const fh = await open(file, 'r');
	let header: Buffer, tag: Buffer, size: number;
	try {
		size = (await fh.stat()).size;
		if (size < HEADER + TAG) throw new PassphraseError('damaged');
		header = Buffer.alloc(HEADER);
		await fh.read(header, 0, HEADER, 0);
		tag = Buffer.alloc(TAG);
		await fh.read(tag, 0, TAG, size - TAG);
	} finally {
		await fh.close();
	}
	if (!header.subarray(0, MAGIC.length).equals(MAGIC) || header[MAGIC.length] !== VERSION) throw new PassphraseError('format');
	const salt = header.subarray(MAGIC.length + 1, MAGIC.length + 17);
	const iv = header.subarray(MAGIC.length + 17, HEADER);
	const key = await deriveKey(passphrase, salt);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const body = size - TAG > HEADER ? createReadStream(file, { start: HEADER, end: size - TAG - 1 }) : [];
	return (async function* () {
		for await (const c of body as AsyncIterable<Buffer>) yield decipher.update(c);
		try {
			yield decipher.final();
		} catch {
			throw new PassphraseError('passphrase');
		}
	})();
}
