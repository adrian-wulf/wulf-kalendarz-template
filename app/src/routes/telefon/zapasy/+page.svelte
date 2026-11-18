<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Fold from '#lib/components/phone/Fold.svelte';
	import AddSheet from '#lib/components/phone/AddSheet.svelte';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { ageLabel, categories, categoryOf, frequentFor, groupByCategory, guessCategory } from '#lib/logic/pantry.js';
	import { fmtShortDate } from '#lib/format.js';
	import { t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let placeId = $state<string | null>(null);
	const place = $derived(data.places.find((p) => p.id === placeId) ?? data.places[0]);
	const inPlace = $derived(data.items.filter((i) => i.placeId === place.id));
	const groups = $derived(groupByCategory(inPlace.filter((i) => i.qty > 0)));
	const empty = $derived(inPlace.filter((i) => i.qty <= 0));
	const frequent = $derived(frequentFor(data.products, place.id, 16));
	const warnings = $derived(data.items.filter((i) => i.warn));
	const WARN_LABEL = { expired: () => t('pantry.warn.expired'), expiring: () => t('pantry.warn.expiring'), old: () => t('pantry.warn.old') } as const;
	const short = fmtShortDate;
	const sum = (list: { qty: number }[]) => list.reduce((n, i) => n + i.qty, 0);

	// Panel dodawania
	let adding = $state(false);
	let name = $state('');
	let qty = $state(1);
	let category = $state<string | null>(null); // null = z historii albo zgadnięta z nazwy
	let pickCategory = $state(false);
	let date = $state('');
	let bestBefore = $state('');
	let suggestions = $state<{ name: string; icon: string }[]>([]);
	let busy = $state(false);
	const known = $derived(name.trim() ? data.products.filter((p) => p.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 5) : []);
	const exact = $derived(data.products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()));
	const cat = $derived(category ?? exact?.category ?? (name.trim() ? guessCategory(name) : 'inne'));

	$effect(() => {
		const q = name;
		if (!adding || !q.trim()) return void (suggestions = []);
		const ctrl = new AbortController();
		fetch(`/api/shopping/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
			.then((r) => r.json())
			.then((s) => (suggestions = s))
			.catch(() => {});
		return () => ctrl.abort();
	});

	function reset() {
		name = '';
		qty = 1;
		category = null;
		pickCategory = false;
		date = '';
		bestBefore = '';
	}

	async function add(n: string, q: number, c?: string, extra: { date?: string; bestBefore?: string } = {}) {
		busy = true;
		try {
			await api('/api/pantry', 'POST', { name: n, placeId: place.id, qty: q, category: c, ...extra });
			await invalidateAll();
			say(`✓ ${place.icon} ${n} +${q}`);
			return true;
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
			return false;
		} finally {
			busy = false;
		}
	}

	async function submit() {
		const ok = await add(name.trim(), qty, cat, { date: place.freezer && date ? date : undefined, bestBefore: bestBefore || undefined });
		if (ok) {
			reset();
			adding = false;
		}
	}

	async function adjust(itemId: number, delta: 1 | -1) {
		try {
			const r = await api<{ shopping: string | null; shoppingError?: string }>('/api/pantry/adjust', 'POST', { itemId, delta });
			await invalidateAll();
			if (r.shopping) say(`🛒 ${t('pantry.toShopping', { name: r.shopping })}`);
			else if (r.shoppingError) say(t('pantry.toShoppingFailed', { error: r.shoppingError }), { error: true });
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}

	async function removeItem(id: number) {
		await api(`/api/pantry/items/${id}`, 'DELETE');
		await invalidateAll();
	}
</script>

<div class="seg">
	{#each data.places as p (p.id)}
		<button type="button" class:on={p.id === place.id} onclick={() => (placeId = p.id)}>{p.icon} {p.name} <small>{sum(data.items.filter((i) => i.placeId === p.id))}</small></button>
	{/each}
</div>

{#if warnings.length}
	<Fold id="zapasy-uwaga" title="⚠️ {t('pantry.useUp')}" aside={String(warnings.length)} tone="warn">
		{#each warnings as w (w.id)}
			<div class="wl">{w.product.name} – {WARN_LABEL[w.warn!]()}{w.warn === 'old' ? ` (${ageLabel(w.addedAt, data.today)})` : w.bestBefore ? ` (${short(w.bestBefore)})` : ''}</div>
		{/each}
	</Fold>
{/if}

{#key place.id}
{#each groups as [[id, icon, label], list] (id)}
	<Fold id="zapasy-{place.id}-{id}" title="{icon} {label}" aside="{tn('pantry.positions', list.length)} · {tn('pantry.pieces', sum(list))}">
		{#each list as i (i.id)}
			<div class="item" class:bad={i.warn}>
				<div class="nm">
					<span>{i.product.name}</span>
					{#if place.freezer || i.bestBefore}<small class="ph-muted">{place.freezer ? ageLabel(i.addedAt, data.today) : ''}{i.bestBefore ? ` · ${t('pantry.until', { date: short(i.bestBefore) })}` : ''}</small>{/if}
				</div>
				<button type="button" class="st" onclick={() => adjust(i.id, -1)} aria-label={t('pantry.less')}>−</button>
				<span class="q"><b>{i.qty}</b> {i.product.unit}</span>
				<button type="button" class="st" onclick={() => adjust(i.id, 1)} aria-label={t('pantry.more')}>+</button>
			</div>
		{/each}
	</Fold>
{:else}
	<p class="ph-muted">{t('pantry.placeEmpty', { place: place.name })}</p>
{/each}

{#if empty.length}
	<Fold id="zapasy-{place.id}-koniec" title="🛒 {t('pantry.runOut')}" aside={String(empty.length)}>
		<div class="chips">
			{#each empty as i (i.id)}
				<span class="out">
					<button type="button" class="chip" onclick={() => adjust(i.id, 1)}>+ {i.product.name}</button>
					<button type="button" class="x" onclick={() => removeItem(i.id)} aria-label={t('common.delete')}>✕</button>
				</span>
			{/each}
		</div>
	</Fold>
{/if}
{/key}

<AddSheet title={t('pantry.addTo', { place: place.name })} bind:open={adding}>
	<form onsubmit={(e) => (e.preventDefault(), submit())}>
		<input class="ph-input" bind:value={name} maxlength="60" placeholder={t('pantry.addPlaceholder')} autocomplete="off" />

		{#if !name.trim()}
			{#if frequent.length}
				<div class="ph-label">{t('pantry.frequentTap')}</div>
				<div class="chips">
					{#each frequent as p (p.id)}
						<button type="button" class="chip" disabled={busy} onclick={() => add(p.name, 1)}>{p.icon ?? '•'} {p.name}</button>
					{/each}
				</div>
			{/if}
		{:else}
			{#if known.length || suggestions.length}
				<div class="chips sugg">
					{#each known as p (p.id)}
						<button type="button" class="chip on" onclick={() => (name = p.name)}>{p.icon ?? '•'} {p.name}</button>
					{/each}
					{#each suggestions.filter((s) => !known.some((k) => k.name.toLowerCase() === s.name.toLowerCase()) && s.name.toLowerCase() !== name.trim().toLowerCase()) as s (s.name)}
						<button type="button" class="chip" onclick={() => (name = s.name)}>{s.icon} {s.name}</button>
					{/each}
				</div>
			{/if}

			<div class="ph-row qty">
				<button type="button" class="ph-btn" onclick={() => (qty = Math.max(1, qty - 1))}>−</button>
				<b>{qty}</b>
				<button type="button" class="ph-btn" onclick={() => (qty = Math.min(999, qty + 1))}>+</button>
				{#each [2, 5, 10] as n (n)}<button type="button" class="chip" class:on={qty === n} onclick={() => (qty = n)}>{n}</button>{/each}
			</div>

			<button type="button" class="line" onclick={() => (pickCategory = !pickCategory)}>
				<span class="ph-muted">{t('pantry.category')}</span>
				<span>{categoryOf(cat)[1]} {categoryOf(cat)[2]}</span>
				<span class="ch">{pickCategory ? t('pantry.categoryDone') : t('pantry.categoryChange')}</span>
			</button>
			{#if pickCategory}
				<div class="chips">
					{#each categories() as [id, icon, label] (id)}
						<button type="button" class="chip" class:on={cat === id} onclick={() => ((category = id), (pickCategory = false))}>{icon} {label}</button>
					{/each}
				</div>
			{/if}

			<details class="more">
				<summary class="ph-muted">{t('pantry.datesOptional')}</summary>
				<div class="dates">
					{#if place.freezer}<label>{t('pantry.frozenOn')} <input class="ph-input" type="date" bind:value={date} max={data.today} /></label>{/if}
					<label>{t('pantry.bestBefore')} <input class="ph-input" type="date" bind:value={bestBefore} /></label>
				</div>
			</details>

			<button class="ph-btn primary full" disabled={busy}>✓ {t('pantry.addQty', { qty, name: name.trim() })}</button>
		{/if}
	</form>
</AddSheet>

<style>
	.seg {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: var(--line);
		margin-bottom: 10px;
	}
	.seg button {
		font: 700 16px var(--font-body);
		padding: 10px 6px;
		border-radius: 10px;
		border: none;
		background: transparent;
		color: var(--fg);
	}
	.seg small {
		opacity: 0.55;
	}
	.seg button.on {
		background: var(--card);
		box-shadow: var(--shadow);
	}
	.wl {
		font-size: 15px;
		padding: 3px 0;
	}
	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 40px 64px 40px;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		border-top: 1px solid var(--line);
	}
	.item:first-child {
		border-top: none;
	}
	.nm {
		display: grid;
		min-width: 0;
	}
	.nm span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item.bad .nm span {
		color: #c2410c;
		font-weight: 700;
	}
	.st {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: none;
		background: var(--bg);
		color: var(--fg);
		font: 700 22px var(--font-body);
	}
	.q {
		text-align: center;
		font-size: 13px;
		white-space: nowrap;
	}
	.q b {
		font-size: 19px;
	}
	.out {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.x {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: none;
		background: var(--line);
		color: var(--muted);
	}
	.sugg {
		margin-top: 10px;
	}
	.qty {
		margin-top: 12px;
	}
	.qty b {
		font-size: 24px;
		min-width: 36px;
		text-align: center;
	}
	.line {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 14px 0 8px;
		padding: 12px 14px;
		border-radius: 12px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 600 16px var(--font-body);
		text-align: left;
	}
	.line span:nth-child(2) {
		flex: 1;
	}
	.ch {
		color: var(--muted);
		font-size: 14px;
	}
	.more {
		margin-top: 10px;
	}
	.more summary {
		padding: 6px 0;
		cursor: pointer;
	}
	.dates {
		display: grid;
		gap: 8px;
		margin-top: 6px;
		font-size: 14px;
		color: var(--muted);
	}
	.dates label {
		display: grid;
		gap: 4px;
	}
	.full {
		width: 100%;
		margin-top: 16px;
	}
</style>
