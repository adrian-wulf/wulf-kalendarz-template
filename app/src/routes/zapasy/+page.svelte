<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto, invalidateAll } from '$app/navigation';
	import { updated } from '$app/state';
	import Stage from '#lib/components/Stage.svelte';
	import { kioskBody } from '#lib/kiosk/mode.js';
	import Sheet from '#lib/components/kiosk/Sheet.svelte';
	import Keyboard from '#lib/components/kiosk/Keyboard.svelte';
	import { ageLabel, categories, frequentFor, groupByCategory, guessCategory } from '#lib/logic/pantry.js';
	import { fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import { needPin } from '#lib/kiosk/pin.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let placeId = $state<string | null>(null);
	const place = $derived(data.places.find((p) => p.id === placeId) ?? data.places[0]);
	const inPlace = $derived(data.items.filter((i) => i.placeId === place.id));
	const groups = $derived(groupByCategory(inPlace.filter((i) => i.qty > 0)));
	const empty = $derived(inPlace.filter((i) => i.qty <= 0));
	const frequent = $derived(frequentFor(data.products, place.id));
	const warnings = $derived(data.items.filter((i) => i.warn));
	const count = (id: string) => data.items.filter((i) => i.placeId === id && i.qty > 0).reduce((n, i) => n + i.qty, 0);

	const WARN_LABEL = { expired: () => t('pantry.warn.expired'), expiring: () => t('pantry.warn.expiring'), old: () => t('pantry.warn.old') } as const;
	const short = fmtShortDate;

	let toast = $state<{ text: string; error?: boolean } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;
	function say(text: string, error = false) {
		toast = { text, error };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 6000);
	}

	async function post(url: string, body: unknown) {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? t('common.error'));
		return r.json();
	}

	async function adjust(itemId: number, delta: 1 | -1) {
		try {
			const r = await post('/api/pantry/adjust', { itemId, delta });
			await invalidateAll();
			if (r.shopping) say(`🛒 ${t('pantry.toShopping', { name: r.shopping })}`);
			else if (r.shoppingError) say(t('pantry.toShoppingFailed', { error: r.shoppingError }), true);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), true);
		}
	}

	async function quickAdd(name: string, qty = 1, category?: string) {
		try {
			await post('/api/pantry', { name, placeId: place.id, qty, category });
			await invalidateAll();
			say(`✓ ${place.icon} ${name} +${qty}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), true);
		}
	}

	async function removeItem(id: number) {
		// --- p4: security --- usunięcie produktu po PIN-ie, gdy włączono „PIN przy usuwaniu”.
		if (!(await needPin('delete'))) return;
		await fetch(`/api/pantry/items/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' } });
		await invalidateAll();
	}

	// Nowy produkt: nazwa z klawiatury (podpowiedzi), ilość, kategoria.
	let adding = $state(false);
	let step = $state<'name' | 'details'>('name');
	let name = $state('');
	let qty = $state(1);
	let category = $state('inne');
	let suggestions = $state<{ name: string; icon: string }[]>([]);
	const known = $derived(
		name.trim()
			? data.products.filter((p) => p.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 6)
			: []
	);

	$effect(() => {
		if (!adding) return;
		const q = name;
		if (!q.trim()) return void (suggestions = []);
		const ctrl = new AbortController();
		fetch(`/api/shopping/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
			.then((r) => r.json())
			.then((s) => (suggestions = s))
			.catch(() => {});
		return () => ctrl.abort();
	});

	function openAdd() {
		adding = true;
		step = 'name';
		name = '';
		qty = 1;
	}
	function pickName(n: string) {
		name = n;
		category = data.products.find((p) => p.name.toLowerCase() === n.toLowerCase())?.category ?? guessCategory(n);
		step = 'details';
	}
	async function confirmAdd() {
		await quickAdd(name.trim(), qty, category);
		adding = false;
	}

	$effect(() => {
		document.documentElement.dataset.phase = data.phase;
	});

	onMount(() => {
		kioskBody();
		let lastTouch = Date.now();
		const onTouch = () => (lastTouch = Date.now());
		window.addEventListener('pointerdown', onTouch, true);
		const timer = setInterval(() => {
			if (Date.now() - lastTouch > 180_000) goto('/');
			else if (!adding && Date.now() - lastTouch > 20_000) updated.current ? location.reload() : invalidateAll();
		}, 30_000);
		return () => {
			window.removeEventListener('pointerdown', onTouch, true);
			clearInterval(timer);
		};
	});
</script>

<Stage>
	<main>
		<header>
			<h1>📦 {t('pantry.title')}</h1>
			<div class="tabs">
				{#each data.places as p (p.id)}
					<button type="button" class="tab" class:on={p.id === place.id} onclick={() => (placeId = p.id)}>{p.icon} {p.name} <small>{count(p.id)}</small></button>
				{/each}
			</div>
			<a class="back" href="/">📅 {t('common.appName')}</a>
		</header>

		{#if warnings.length}
			<div class="warnbar">
				⚠️
				{#each warnings.slice(0, 5) as w (w.id)}
					<span class="w {w.warn}">{w.product.icon ?? ''} {w.product.name} – {WARN_LABEL[w.warn!]()}{w.warn === 'old' ? ` (${ageLabel(w.addedAt, data.today)})` : w.bestBefore ? ` (${short(w.bestBefore)})` : ''}</span>
				{/each}
			</div>
		{/if}

		<div class="body">
			<section class="list">
				{#each groups as [[, icon, label], list] (label)}
					<div class="group">
						<h2>{icon} {label}</h2>
						{#each list as i (i.id)}
							<div class="item" class:warn={i.warn}>
								<span class="name">{i.product.icon ?? ''} {i.product.name}</span>
								<span class="meta">
									{#if place.freezer}{ageLabel(i.addedAt, data.today)}{/if}
									{#if i.bestBefore}· {t('pantry.until', { date: short(i.bestBefore) })}{/if}
								</span>
								<button type="button" class="step" onclick={() => adjust(i.id, -1)} aria-label={t('pantry.less')}>−</button>
								<span class="qty"><b>{i.qty}</b> {i.product.unit}</span>
								<button type="button" class="step" onclick={() => adjust(i.id, 1)} aria-label={t('pantry.more')}>+</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="emptyinfo">{place.icon} {t('pantry.placeEmptyKiosk', { place: place.name })}</p>
				{/each}
				{#if empty.length}
					<div class="group">
						<h2>🛒 {t('pantry.runOut')}</h2>
						<div class="chips">
							{#each empty as i (i.id)}
								<span class="out">
									<button type="button" class="chip" onclick={() => adjust(i.id, 1)}>+ {i.product.icon ?? ''} {i.product.name}</button>
									<button type="button" class="x" onclick={() => removeItem(i.id)} aria-label={t('common.delete')}>✕</button>
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			<aside>
				<button type="button" class="new" onclick={openAdd}>+ {t('pantry.addTo', { place: place.name })}</button>
				<div class="label">{t('pantry.frequentTap')}</div>
				<div class="chips">
					{#each frequent as p (p.id)}
						<button type="button" class="chip" onclick={() => quickAdd(p.name)}>{p.icon ?? '•'} {p.name}</button>
					{:else}
						<p class="muted">{t('pantry.frequentEmpty')}</p>
					{/each}
				</div>
			</aside>
		</div>
	</main>

	{#if adding}
		<Sheet title={t('pantry.addTo', { place: `${place.icon} ${place.name}` })} onclose={() => (adding = false)}>
			{#if step === 'name'}
				<div class="field">{name}<span class="caret"></span>{#if !name}<span class="ph"> {t('pantry.namePlaceholder')}</span>{/if}</div>
				<div class="chips sugg">
					{#each known as p (p.id)}
						<button type="button" class="chip on" onclick={() => pickName(p.name)}>{p.icon ?? '•'} {p.name}</button>
					{/each}
					{#each suggestions.filter((s) => !known.some((k) => k.name.toLowerCase() === s.name.toLowerCase())) as s (s.name)}
						<button type="button" class="chip" onclick={() => pickName(s.name)}>{s.icon} {s.name}</button>
					{/each}
				</div>
				<div class="spacer"></div>
				<Keyboard bind:value={name} max={60} onenter={() => name.trim() && pickName(name.trim())} enterLabel="{t('common.next')} ›" enterDisabled={!name.trim()} />
			{:else}
				<p class="big">{name}</p>
				<div class="label">{t('pantry.howMany')}</div>
				<div class="qtyrow">
					<button type="button" class="btn" onclick={() => (qty = Math.max(1, qty - 1))}>−</button>
					<span class="qtyval">{qty}</span>
					<button type="button" class="btn" onclick={() => (qty = Math.min(999, qty + 1))}>+</button>
					{#each [2, 3, 5, 10] as n (n)}<button type="button" class="chip" class:on={qty === n} onclick={() => (qty = n)}>{n}</button>{/each}
				</div>
				<div class="label">{t('pantry.category')}</div>
				<div class="chips">
					{#each categories() as [id, icon, label] (id)}
						<button type="button" class="chip" class:on={category === id} onclick={() => (category = id)}>{icon} {label}</button>
					{/each}
				</div>
				<div class="foot">
					<button type="button" class="btn" onclick={() => (step = 'name')}>‹ {t('common.back')}</button>
					<button type="button" class="btn primary" onclick={confirmAdd}>✓ {t('pantry.addQty', { qty, name })}</button>
				</div>
			{/if}
		</Sheet>
	{/if}

	{#if toast}
		<div class="toast" class:error={toast.error} transition:fly={{ y: 60, duration: 200 }}>
			<span>{toast.text}</span><button type="button" onclick={() => (toast = null)}>{t('common.ok')}</button>
		</div>
	{/if}
</Stage>

<style>
	main {
		width: 100%;
		height: 100%;
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 28px;
	}
	h1 {
		margin: 0;
		font: 800 60px var(--font-head);
	}
	.tabs {
		display: flex;
		gap: 12px;
	}
	.tab {
		font: 700 32px var(--font-body);
		padding: 16px 30px;
		border-radius: 20px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	.tab small {
		font-size: 24px;
		opacity: 0.6;
		margin-left: 6px;
	}
	.tab.on {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.back {
		margin-left: auto;
		font: 700 30px var(--font-body);
		padding: 18px 30px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		text-decoration: none;
		box-shadow: var(--shadow);
	}
	.warnbar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 22px;
		align-items: center;
		font-size: 24px;
		padding: 12px 20px;
		border-radius: 16px;
		background: #fff1e6;
		color: #9a3412;
	}
	:global([data-phase='evening']) .warnbar,
	:global([data-phase='night']) .warnbar {
		background: #4a2c1a;
		color: #ffd8b0;
	}
	.w.expired {
		font-weight: 800;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 600px;
		gap: 18px;
	}
	.list {
		min-height: 0;
		overflow-y: auto;
		columns: 2;
		column-gap: 18px;
	}
	.group {
		break-inside: avoid;
		background: var(--card);
		border-radius: 20px;
		padding: 14px 18px;
		margin-bottom: 18px;
		box-shadow: var(--shadow);
	}
	h2 {
		margin: 0 0 8px;
		font: 800 26px var(--font-head);
	}
	.item {
		display: grid;
		grid-template-columns: 1fr auto 64px 120px 64px;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		border-top: 2px solid var(--line);
		font-size: 27px;
	}
	.item:first-of-type {
		border-top: none;
	}
	.item.warn .name {
		color: #c2410c;
		font-weight: 700;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: 20px;
		color: var(--muted);
		white-space: nowrap;
	}
	.qty {
		text-align: center;
		font-size: 22px;
		white-space: nowrap;
	}
	.qty b {
		font-size: 32px;
	}
	.step {
		height: 60px;
		border-radius: 14px;
		border: none;
		background: var(--bg);
		color: var(--fg);
		font: 700 36px var(--font-body);
	}
	.emptyinfo {
		font-size: 30px;
		color: var(--muted);
	}
	.out {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.x {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: none;
		background: var(--bg);
		color: var(--muted);
		font-size: 22px;
	}
	aside {
		background: var(--card);
		border-radius: 20px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 0;
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.new {
		font: 800 32px var(--font-body);
		padding: 26px;
		border-radius: 18px;
		border: none;
		background: var(--fg);
		color: var(--card);
	}
	.muted {
		color: var(--muted);
		font-size: 24px;
	}
	.sugg {
		min-height: 70px;
	}
	.spacer {
		flex: 1;
	}
	.big {
		font: 800 52px var(--font-head);
		margin: 0;
	}
	.qtyrow {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.qtyval {
		font: 800 56px var(--font-body);
		min-width: 90px;
		text-align: center;
	}
	.foot {
		display: flex;
		gap: 18px;
		margin-top: auto;
		justify-content: flex-end;
	}
	.toast {
		position: absolute;
		left: 50%;
		bottom: 40px;
		transform: translateX(-50%);
		z-index: 30;
		background: var(--fg);
		color: var(--card);
		border-radius: 20px;
		font: 600 30px var(--font-body);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: center;
		gap: 30px;
		padding: 16px 16px 16px 32px;
	}
	.toast.error {
		background: var(--alert);
	}
	.toast button {
		font: 700 30px var(--font-body);
		padding: 16px 30px;
		border-radius: 14px;
		border: none;
		background: var(--card);
		color: var(--fg);
	}
</style>
