/**
 * Skrót hasła do AUTH_PASSWORD_HASH (AUTH_MODE=password) – ten sam format co aplikacja (scrypt, sól):
 *
 *   node server/hash-password.js            # pyta o hasło (bez echa)
 *   printf '%s' 'hasło' | node server/hash-password.js
 *   docker compose run --rm kalendarz node server/hash-password.js
 *
 * Wynik (bez znaku `$`) wklej do .env: AUTH_PASSWORD_HASH=scrypt:…
 * Prints a scrypt hash for AUTH_PASSWORD_HASH.
 */
import { randomBytes, scrypt } from 'node:crypto';
import process from 'node:process';

const PARAMS = { N: 1 << 15, r: 8, p: 1 };
const MIN = 10;

/**
 * @param {string} secret
 * @param {{ N: number, r: number, p: number }} [params]
 * @returns {Promise<string>}
 */
export function hashPassword(secret, params = PARAMS) {
	const salt = randomBytes(16);
	return new Promise((resolve, reject) =>
		scrypt(secret.normalize('NFC'), salt, 32, { ...params, maxmem: 256 * params.N * params.r + 1024 * 1024 }, (err, key) =>
			err ? reject(err) : resolve(`scrypt:${params.N}:${params.r}:${params.p}:${salt.toString('base64url')}:${key.toString('base64url')}`)
		)
	);
}

/** @returns {Promise<string>} */
async function readSecret() {
	if (!process.stdin.isTTY) {
		let data = '';
		for await (const chunk of process.stdin) data += chunk;
		return data.replace(/\r?\n$/, '');
	}
	process.stderr.write('Hasło / password: ');
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	return new Promise((resolve) => {
		let s = '';
		process.stdin.on('data', (/** @type {string} */ ch) => {
			for (const c of ch) {
				if (c === '\r' || c === '\n') {
					process.stdin.setRawMode(false);
					process.stdin.pause();
					process.stderr.write('\n');
					return resolve(s);
				}
				if (c === '\u0003') process.exit(130);
				if (c === '\u007f') s = s.slice(0, -1);
				else s += c;
			}
		});
	});
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const secret = await readSecret();
	if (secret.length < MIN) {
		console.error(`Hasło musi mieć co najmniej ${MIN} znaków. / At least ${MIN} characters.`);
		process.exit(1);
	}
	console.log(await hashPassword(secret));
}
