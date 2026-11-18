import { json } from '@sveltejs/kit';
import { iconFor, suggestProducts } from '#lib/products.js';
import { getDb } from '#lib/server/db/index.js';
import { bringCatalogNames, isBringReady } from '#lib/server/bring.js';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/ß/g, 'ss');

export async function GET({ url }) {
	const q = url.searchParams.get('q') ?? '';
	const own = suggestProducts(q);
	if (!q.trim() || !isBringReady(getDb())) return json(own);
	const n = norm(q.trim());
	const names = await bringCatalogNames();
	const extra = names
		.filter((x) => norm(x).startsWith(n) && !own.some((o) => o.name.toLowerCase() === x.toLowerCase()))
		.slice(0, 8 - own.length)
		.map((name) => ({ name, icon: iconFor(name) ?? '🛒' }));
	return json([...own, ...extra]);
}
