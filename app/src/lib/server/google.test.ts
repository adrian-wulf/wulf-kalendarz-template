import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { seed } from './db/seed';
import { members, secrets } from './db/schema';
import { authUrl, deleteById, fetchGoogle, googleRedirectUri, GoogleError, insertFamilyEvent, isConnected, listCalendars, setClient, setRoles, REAUTH_MSG } from './google';
import type { Fetcher } from './sources/index';

function setup() {
	const db = openDb(':memory:');
	seed(db);
	setClient(db, { id: 'cid', secret: 'sec' });
	db.insert(secrets).values({ key: 'google.refresh', value: JSON.stringify('rt') }).run();
	setRoles(db, { family: 'fam', notes: 'notes', kita: null, birthdays: null });
	return db;
}

/** Podstawiony Google: token + wydarzenia per kalendarz; zapisuje wysłane żądania. */
function fakeGoogle(byCal: Record<string, unknown[]>, calls: { url: string; init?: RequestInit }[] = []): Fetcher {
	return async (input, init) => {
		const url = String(input);
		calls.push({ url, init });
		if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'at', expires_in: 3600 });
		const m = url.match(/calendars\/([^/]+)\/events/);
		if (m && (!init?.method || init.method === 'GET')) return Response.json({ items: byCal[decodeURIComponent(m[1])] ?? [] });
		if (init?.method === 'DELETE') return new Response(null, { status: 204 });
		return Response.json({ id: 'new' });
	};
}

describe('Google Calendar', () => {
	it('łączy kalendarze domowników, „Rodzinę” i kartki', async () => {
		const db = setup();
		const all = db.select().from(members).all();
		const mama = { ...all.find((m) => m.id === 'mama')!, calendarIds: ['mama@example.com'], emails: [] };
		const list = all.map((m) => (m.id === 'mama' ? mama : m));
		const now = new Date('2026-11-02T12:00:00Z');
		const f = fakeGoogle({
			'mama@example.com': [{ id: 'a', summary: 'Praca', start: { dateTime: '2026-11-03T10:00:00+01:00' }, end: { dateTime: '2026-11-03T18:00:00+01:00' } }],
			fam: [
				{ id: 'b', summary: 'Babcia: Fryzjer', start: { date: '2026-11-04' }, end: { date: '2026-11-05' }, extendedProperties: { private: { kalendarzMemberId: 'babcia' } } },
				{ id: 'c', summary: 'Grill', status: 'cancelled', start: { date: '2026-11-04' }, end: { date: '2026-11-05' } }
			],
			notes: [
				{ id: 'n1', summary: 'Obiad w lodówce', creator: { email: 'MAMA@example.com' }, start: { dateTime: '2026-11-02T10:00:00Z' }, end: { dateTime: '2026-11-02T20:00:00Z' } },
				{ id: 'n2', summary: 'Stara', start: { dateTime: '2026-11-01T10:00:00Z' }, end: { dateTime: '2026-11-01T20:00:00Z' } }
			]
		});
		const d = await fetchGoogle(db, list, '2026-11-02', now, f);
		expect(d.events).toEqual([
			expect.objectContaining({ id: 'g:mama@example.com:a', memberId: 'mama', start: '2026-11-03T09:00:00.000Z', allDay: false }),
			expect.objectContaining({ id: 'g:fam:b', memberId: 'babcia', title: 'Fryzjer', allDay: true })
		]);
		expect(d.notes).toEqual([{ id: 'g:notes:n1', text: 'Obiad w lodówce', memberId: 'mama', expiresAt: '2026-11-02T20:00:00.000Z' }]);
	});

	it('zapis z kiosku: prefiks imienia i przypisanie osoby', async () => {
		const db = setup();
		const calls: { url: string; init?: RequestInit }[] = [];
		await insertFamilyEvent(
			db,
			{ title: 'Dentysta', memberId: 'mama', start: '2026-11-05T14:00:00.000Z', end: '2026-11-05T15:00:00.000Z', allDay: false },
			{ id: 'mama', name: 'Mama', color: '#e0457b', avatar: null },
			fakeGoogle({}, calls)
		);
		const post = calls.find((c) => c.init?.method === 'POST' && c.url.includes('/calendars/fam/events'))!;
		expect(JSON.parse(String(post.init!.body))).toMatchObject({
			summary: 'Mama: Dentysta',
			extendedProperties: { private: { kalendarzMemberId: 'mama' } }
		});
	});

	it('lista kalendarzy z właściwego adresu API', async () => {
		const db = setup();
		const f: Fetcher = async (input) => {
			const url = String(input);
			if (url.includes('oauth2')) return Response.json({ access_token: 'at', expires_in: 3600 });
			if (url.startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList'))
				return Response.json({ items: [{ id: 'fam', summary: 'Rodzina', accessRole: 'owner', etag: 'x' }] });
			return new Response('not found', { status: 404 });
		};
		expect(await listCalendars(db, f)).toEqual([{ id: 'fam', summary: 'Rodzina', accessRole: 'owner', primary: undefined }]);
	});

	it('kiosk nie może kasować w prywatnych kalendarzach', async () => {
		const db = setup();
		await expect(deleteById(db, 'g:mama@example.com:a', fakeGoogle({}))).rejects.toThrow(GoogleError);
		await expect(deleteById(db, 'g:notes:n1', fakeGoogle({}))).resolves.toBeUndefined();
	});

	it('cofnięty dostęp → prośba o ponowne logowanie', async () => {
		const db = setup();
		// Token w pamięci mógł zostać z poprzedniego testu – wtedy API odpowie 401.
		const f: Fetcher = async (input) =>
			String(input).includes('oauth2') ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : new Response('', { status: 401 });
		await expect(fetchGoogle(db, [], '2026-11-02', new Date(), f)).rejects.toThrow(REAUTH_MSG);
		expect(isConnected(db)).toBe(true);
	});

	it('adres powrotu z Google wynika z adresu panelu', () => {
		expect(googleRedirectUri('https://kalendarz.tailnet.ts.net', {})).toBe('https://kalendarz.tailnet.ts.net/admin/google/callback');
		expect(googleRedirectUri('http://localhost:3000', { PUBLIC_ORIGIN: 'https://dom.example.ts.net/' })).toBe('https://dom.example.ts.net/admin/google/callback');
		expect(googleRedirectUri('http://localhost:3000', { PUBLIC_ORIGIN: '' })).toBe('http://localhost:3000/admin/google/callback');
		expect(googleRedirectUri('http://localhost:3000', { GOOGLE_REDIRECT_URI: 'https://x.example/cb', PUBLIC_ORIGIN: 'https://y.example' })).toBe('https://x.example/cb');
		const url = new URL(authUrl({ id: 'cid', secret: 'sec' }, 'st', googleRedirectUri('https://a.example', {})));
		expect(url.searchParams.get('redirect_uri')).toBe('https://a.example/admin/google/callback');
	});
});
