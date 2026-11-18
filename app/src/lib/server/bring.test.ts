import { describe, expect, it } from 'vitest';
import { openDb } from './db/index';
import { bringAdd, bringComplete, bringLists, bringLogin, catalogUrl, fetchBring, setBringConfig } from './bring';
import { setLang } from '#lib/i18n/index.js';
import type { Fetcher } from './sources/index';

/** Podstawiony Bring!: logowanie, listy, pozycje, katalog pl; zapisuje żądania. */
function fakeBring(calls: { url: string; init?: RequestInit }[] = []): Fetcher {
	return async (input, init) => {
		const url = String(input);
		calls.push({ url, init });
		if (url.endsWith('/v2/bringauth')) {
			const body = new URLSearchParams(String(init?.body));
			if (body.get('password') !== 'dobre') return new Response('', { status: 401 });
			return Response.json({ uuid: 'u1', access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
		}
		if (url.endsWith('/bringusers/u1/lists')) return Response.json({ lists: [{ listUuid: 'L1', name: 'Dom', theme: 'x' }] });
		if (url.endsWith('/v2/bringlists/L1')) return Response.json({ items: { purchase: [{ uuid: 'i1', itemId: 'Milch', specification: '2 l' }, { uuid: 'i2', itemId: 'Kokosflocken' }] } });
		// prawdziwe API: płasko, pozycje jako {name}, bez uuid
		if (url.endsWith('/v2/bringlists/L2')) return Response.json({ uuid: 'L2', purchase: [{ specification: 'Mokre', name: 'Milch' }, { specification: '', name: 'Tytoń' }], recently: [] });
		if (url.endsWith('articles.pl-PL.json')) return Response.json({ Milch: 'Mleko', Tomaten: 'Pomidory' });
		if (url.endsWith('/v2/bringlists/L1/items')) return new Response(null, { status: 204 });
		return new Response('?', { status: 404 });
	};
}

describe('Bring!', () => {
	it('złe hasło daje czytelny błąd', async () => {
		await expect(bringLogin(openDb(':memory:'), 'a@b.c', 'zle', fakeBring())).rejects.toThrow('zły e-mail albo hasło');
	});

	it('listy, pozycje po polsku, dodanie i odhaczenie', async () => {
		const db = openDb(':memory:');
		const calls: { url: string; init?: RequestInit }[] = [];
		const f = fakeBring(calls);
		await bringLogin(db, 'a@b.c', 'dobre', f);
		expect(await bringLists(db, f)).toEqual([{ listUuid: 'L1', name: 'Dom' }]);
		setBringConfig(db, { listUuid: 'L1', listName: 'Dom' });

		const items = await fetchBring(db, f);
		expect(items[0]).toMatchObject({ id: 'b:i1:Milch', name: 'Mleko', spec: '2 l', icon: '🥛' });
		expect(items[1].name).toBe('Kokosflocken'); // brak tłumaczenia – zostaje oryginał

		await bringAdd(db, 'pomidory', f);
		await bringComplete(db, 'b:i1:Milch', f);
		const puts = calls.filter((c) => c.init?.method === 'PUT').map((c) => JSON.parse(String(c.init!.body)).changes[0]);
		expect(puts).toEqual([
			{ itemId: 'Tomaten', spec: '', operation: 'TO_PURCHASE' },
			{ itemId: 'Milch', spec: '', uuid: 'i1', operation: 'TO_RECENTLY' }
		]);
	});

	it('czyta płaską odpowiedź z prawdziwego API', async () => {
		const db = openDb(':memory:');
		const f = fakeBring();
		await bringLogin(db, 'a@b.c', 'dobre', f);
		setBringConfig(db, { listUuid: 'L2', listName: 'Dom' });
		expect(await fetchBring(db, f)).toMatchObject([
			{ id: 'b::Milch', name: 'Mleko', spec: 'Mokre' },
			{ id: 'b::Tytoń', name: 'Tytoń' }
		]);
	});
});

describe('Bring!: katalog w języku interfejsu', () => {
	it('nazwy z katalogu de-DE / en-GB, ikona po nazwie w każdym języku', async () => {
		const asked: string[] = [];
		const base = fakeBring();
		const f: Fetcher = async (input, init) => {
			const url = String(input);
			asked.push(url);
			if (url.endsWith('articles.en-GB.json')) return Response.json({ Milch: 'Milk', Tomaten: 'Tomatoes' });
			if (url.endsWith('articles.de-DE.json')) return Response.json({ Milch: 'Milch', Tomaten: 'Tomaten' });
			return base(input, init);
		};
		const db = openDb(':memory:');
		await bringLogin(db, 'a@b.c', 'dobre', f);
		setBringConfig(db, { listUuid: 'L1', listName: 'Dom' });
		try {
			setLang('en');
			expect((await fetchBring(db, f))[0]).toMatchObject({ name: 'Milk', icon: '🥛' });
			await bringAdd(db, 'Tomatoes', f);
			setLang('de');
			expect((await fetchBring(db, f))[0]).toMatchObject({ name: 'Milch', icon: '🥛' });
		} finally {
			setLang('pl');
		}
		expect(asked.some((u) => u.endsWith('articles.en-GB.json'))).toBe(true);
		expect(asked.some((u) => u.endsWith('articles.de-DE.json'))).toBe(true);
		expect(catalogUrl('pl')).toBe('https://web.getbring.com/locale/articles.pl-PL.json');
	});
});
