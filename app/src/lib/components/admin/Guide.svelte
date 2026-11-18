<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { GUIDES, defaultVariant, parseInline, type GuideContext, type GuideId, type GuideParams, type TipState } from '#lib/guides/index.js';
	import { getLang, t, type TextKey } from '#lib/i18n/index.js';

	/**
	 * Rozwijane „Jak to ustawić?” nad sekcją panelu: numerowane kroki (jedna czynność na krok), linki
	 * w nowej karcie, zrzuty z trybu demo, wariant kraju (z regionu, drugi pod przełącznikiem)
	 * i na końcu sprawdzenie „✓ Gotowe – to działa”, gdy da się to sprawdzić.
	 */
	let {
		id,
		ctx,
		params = {},
		status = null,
		open = false
	}: { id: GuideId; ctx: GuideContext; params?: GuideParams; status?: TipState | null; open?: boolean } = $props();

	const g = $derived(GUIDES[id]);
	let chosen = $state<string | null>(null);
	const variant = $derived(g.variants.find((v) => v.id === chosen) ?? defaultVariant(g, ctx));
	const tip = $derived(g.tip);

	// Otwarte/zamknięte zapamiętane na tym urządzeniu; link z listy „Co jeszcze…” (?guide=) zawsze otwiera.
	const KEY = $derived(`guide-open:${id}`);
	let isOpen = $state(false);
	let el = $state<HTMLDetailsElement>();
	onMount(() => {
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(KEY);
		} catch {
			/* prywatne okno */
		}
		const fromLink = new URL(location.href).searchParams.get('guide') === id;
		isOpen = fromLink || (saved === null ? open : saved === '1');
		if (fromLink) el?.scrollIntoView({ block: 'start' });
	});
	function toggled() {
		if (!el || el.open === isOpen) return;
		isOpen = el.open;
		try {
			localStorage.setItem(KEY, isOpen ? '1' : '0');
		} catch {
			/* bez zapamiętania */
		}
	}

	let checking = $state(false);
	let checked = $state(false);
	async function check() {
		checking = true;
		await invalidateAll();
		checking = false;
		checked = true;
	}
	const tipKey = (part: 'missing' | 'started') => `tips.${tip}.${part}` as TextKey;
</script>

<details class="guide" data-guide={id} data-testid="guide-{id}" open={isOpen} bind:this={el} ontoggle={toggled}>
	<summary>
		<span class="q">{t('guide.ui.how')}</span>
		<span class="ttl">{t(g.title)}</span>
		{#if status === 'done'}<span class="pill good">✓ {t('guide.ui.works')}</span>{/if}
	</summary>
	<div class="body">
		<p class="intro">{t(g.intro)}</p>
		{#if g.variants.length > 1}
			<div class="variants" role="group" aria-label={t('guide.ui.variant')}>
				<span class="muted">{t('guide.ui.variant')}</span>
				{#each g.variants as v (v.id)}
					<button type="button" aria-pressed={v.id === variant.id} onclick={() => (chosen = v.id)} data-variant={v.id}>{t(v.label)}</button>
				{/each}
			</div>
		{/if}
		<ol class="gsteps">
			{#each variant.steps as s, i (s.text)}
				<li>
					<span class="n" aria-hidden="true">{i + 1}</span>
					<div class="txt">
						<p>
							{#each parseInline(t(s.text, params)) as part, j (j)}
								{#if part.kind === 'bold'}<b>{part.text}</b>{:else if part.kind === 'code'}<code>{part.text}</code>{:else if part.kind === 'link'}<a
										href={part.href}
										target="_blank"
										rel="noopener noreferrer">{part.text}<span class="ext" aria-hidden="true">↗&#xFE0E;</span></a
									>{:else}{part.text}{/if}
							{/each}
						</p>
						{#if s.shot}
							{@const src = `/guides/${s.shot}-${getLang()}.webp`}
							<a class="shot" href={src} target="_blank" rel="noopener"><img {src} alt={t('guide.ui.shot', { n: i + 1 })} /></a>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
		{#if tip && status && status !== 'unknown'}
			<div class="check" class:ok={status === 'done'} data-testid="guide-check" role="status">
				<p>
					{#if status === 'done'}
						<b>✓ {t('guide.ui.done')}</b>
					{:else}
						<b>{t('guide.ui.notYet')}</b> {status === 'started' ? t(tipKey('started')) : t(tipKey('missing'))}
					{/if}
					{#if checked && !checking && status !== 'done'}<br /><span class="muted">{t('guide.ui.checkedStill')}</span>{/if}
				</p>
				<button type="button" onclick={check} disabled={checking}>{checking ? t('guide.ui.checking') : t('guide.ui.check')}</button>
			</div>
		{/if}
	</div>
</details>

<style>
	.guide {
		border: 1px solid var(--line);
		border-left: 4px solid var(--accent, var(--fg));
		border-radius: 12px;
		background: var(--card);
		font-size: 16px;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		padding: 14px 16px;
		cursor: pointer;
		list-style: none;
		font-weight: 700;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::before {
		content: '▸';
		color: var(--muted);
		transition: transform 0.15s;
	}
	.guide[open] summary::before {
		transform: rotate(90deg);
	}
	.q {
		color: var(--fg);
	}
	.ttl {
		color: var(--muted);
		font-weight: 600;
	}
	.pill {
		margin-left: auto;
	}
	.body {
		padding: 0 16px 16px;
		display: grid;
		gap: 12px;
	}
	.intro {
		margin: 0;
		color: var(--muted);
	}
	.variants {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.variants button {
		font: 600 14px var(--font-body);
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--event-bg);
		color: var(--fg);
		cursor: pointer;
	}
	.variants button[aria-pressed='true'] {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.gsteps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
		max-width: 75ch;
	}
	.gsteps li {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
	}
	.n {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--fg);
		color: var(--card);
		font-weight: 700;
		font-size: 14px;
	}
	.txt p {
		margin: 3px 0 0;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.txt code {
		font-size: 14px;
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--event-bg);
		user-select: all;
	}
	.txt a {
		color: inherit;
		font-weight: 600;
	}
	.shot {
		display: inline-block;
		margin-top: 8px;
		max-width: min(100%, 440px);
	}
	.ext {
		font-size: 0.85em;
		margin-left: 2px;
		text-decoration: none;
		display: inline-block;
	}
	.shot img {
		display: block;
		width: auto;
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		border: 1px solid var(--line);
	}
	.check {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 12px 14px;
		border-radius: 10px;
		background: var(--event-bg);
		max-width: 75ch;
	}
	.check p {
		margin: 0;
		flex: 1 1 260px;
	}
	.check.ok b {
		color: #1f8a4c;
	}
	.check button {
		font: 600 14px var(--font-body);
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--fg);
		cursor: pointer;
	}
</style>
