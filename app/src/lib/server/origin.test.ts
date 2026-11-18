import { describe, expect, it } from 'vitest';
import { applyTrustedOrigin, HOST_HEADER, parseOrigins, PROTO_HEADER, trustedOrigins } from '../../../server/origin.js';

describe('TRUSTED_ORIGINS w czasie działania', () => {
	it('czyta listę adresów i pomija błędne', () => {
		const { origins, invalid } = parseOrigins(' http://localhost:3000, https://kalendarz.example.ts.net/ ,,ftp://x, nie-adres');
		expect([...origins]).toEqual(['http://localhost:3000', 'https://kalendarz.example.ts.net']);
		expect(invalid).toEqual(['ftp://x', 'nie-adres']);
		expect(parseOrigins(undefined).origins.size).toBe(0);
	});

	it('zaufany Origin staje się adresem aplikacji', () => {
		const { origins } = parseOrigins('http://localhost:3000');
		const h: Record<string, string | string[] | undefined> = { origin: 'http://localhost:3000', host: '127.0.0.1:3000' };
		expect(applyTrustedOrigin(h, origins)).toBe(true);
		expect(h[PROTO_HEADER]).toBe('http');
		expect(h[HOST_HEADER]).toBe('localhost:3000');
	});

	it('obcy Origin i podrobione nagłówki – nic nie przechodzi', () => {
		const { origins } = parseOrigins('http://localhost:3000');
		const h: Record<string, string | string[] | undefined> = { origin: 'https://zly.example', [PROTO_HEADER]: 'http', [HOST_HEADER]: 'zly.example' };
		expect(applyTrustedOrigin(h, origins)).toBe(false);
		expect(h[PROTO_HEADER]).toBeUndefined();
		expect(h[HOST_HEADER]).toBeUndefined();
		const none: Record<string, string | string[] | undefined> = { origin: 'null' };
		expect(applyTrustedOrigin(none, origins)).toBe(false);
	});

	it('puste TRUSTED_ORIGINS = lokalny adres serwera (npm start bez Dockera)', () => {
		expect([...trustedOrigins({ PORT: '3100' }).origins]).toEqual(['http://localhost:3100', 'http://127.0.0.1:3100']);
		expect(trustedOrigins({ TRUSTED_ORIGINS: ' ' }).defaulted).toBe(true);
		expect([...trustedOrigins({}).origins]).toContain('http://localhost:3000');
		const set = trustedOrigins({ TRUSTED_ORIGINS: 'https://k.example.ts.net', PORT: '3100' });
		expect([...set.origins]).toEqual(['https://k.example.ts.net']);
		expect(set.defaulted).toBe(false);
	});
});
