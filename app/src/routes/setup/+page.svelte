<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { STEPS, prevStep, stepIndex, stepLabel, type StepId } from '#lib/setup.js';
	import { t } from '#lib/i18n/index.js';
	import { FONTS, presetById } from '#lib/theme.js';
	import StepLang from '#lib/components/setup/StepLang.svelte';
	import StepRegion from '#lib/components/setup/StepRegion.svelte';
	import StepPlace from '#lib/components/setup/StepPlace.svelte';
	import StepMembers from '#lib/components/setup/StepMembers.svelte';
	import StepModules from '#lib/components/setup/StepModules.svelte';
	import StepTheme from '#lib/components/setup/StepTheme.svelte';
	import StepLayout from '#lib/components/setup/StepLayout.svelte';
	import StepData from '#lib/components/setup/StepData.svelte';
	import StepSummary from '#lib/components/setup/StepSummary.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const s = $derived(data.setup);
	const step = $derived(s.state.step);
	const idx = $derived(stepIndex(step));

	// Dane bieżącego kroku (wysyłane jako JSON) i czy można iść dalej – ustawia widok kroku.
	let payload = $state<Record<string, unknown>>({});
	let ready = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	$effect(() => {
		error = (form as { error?: string } | null)?.error ?? null;
	});
	// Poprawka w kroku albo inny krok – stary komunikat znika.
	$effect(() => {
		JSON.stringify(payload);
		void step;
		error = null;
	});

	const title = (id: StepId) => t(`setup.${id}.title`);
	const lead = (id: StepId) => t(`setup.${id}.lead`);

	// Podgląd motywu na żywo na kroku „Motyw” (zapis dopiero przyciskiem Dalej).
	let preview = $state<string | null>(null);
	const live = $derived.by(() => {
		const p = step === 'theme' && preview ? presetById(preview) : null;
		if (!p) return undefined;
		const f = FONTS[p.font];
		return [...Object.entries(p.day).map(([k, v]) => `--${k}:${v}`), `--font-head:${f.head}`, `--font-body:${f.body}`].join(';');
	});

	let goForm = $state<HTMLFormElement>();
	let goTo = $state<string>('');
	async function go(to: StepId) {
		goTo = to;
		await tick();
		goForm?.requestSubmit();
	}

	let main = $state<HTMLElement>();
	const submit = () => {
		busy = true;
		return async ({ update, result }: { update: (o?: { reset?: boolean }) => Promise<void>; result: { type: string } }) => {
			await update({ reset: false });
			busy = false;
			if (result.type === 'success') main?.scrollTo({ top: 0 });
		};
	};
</script>

<svelte:head><title>{t('setup.pageTitle')}</title></svelte:head>

<div class="setup" style={live} data-step={step}>
	<header>
		<div class="brand">
			<b>{t('common.appName')}</b>
			<span>{t('setup.firstRun')}</span>
		</div>
		<ol class="progress" aria-label={t('setup.steps')}>
			{#each STEPS as st, i (st.id)}
				{@const can = s.reachable.includes(st.id) && st.id !== step}
				<li class:now={st.id === step} class:past={s.state.saved.includes(st.id) && st.id !== step}>
					<button type="button" disabled={!can || busy} onclick={() => go(st.id)} aria-current={st.id === step ? 'step' : undefined}>
						<span class="num">{i + 1}</span>
						<span class="lbl">{stepLabel(st.id)}</span>
					</button>
				</li>
			{/each}
		</ol>
		<div class="compact" aria-hidden="true">
			<span>{t('setup.stepOf', { n: idx + 1, total: STEPS.length })}</span>
			<span class="bar"><span style:width="{((idx + 1) / STEPS.length) * 100}%"></span></span>
		</div>
	</header>

	<main bind:this={main}>
		<div class="inner">
			<div class="intro">
				<h1>{title(step)}</h1>
				<p class="lead">{lead(step)}</p>
			</div>
			{#key step}
				{#if step === 'lang'}<StepLang bind:payload bind:ready />
				{:else if step === 'region'}<StepRegion data={s} bind:payload bind:ready />
				{:else if step === 'place'}<StepPlace data={s} bind:payload bind:ready />
				{:else if step === 'members'}<StepMembers data={s} bind:payload bind:ready />
				{:else if step === 'modules'}<StepModules data={s} bind:payload bind:ready />
				{:else if step === 'theme'}<StepTheme data={s} bind:payload bind:ready bind:preview />
				{:else if step === 'layout'}<StepLayout data={s} bind:payload bind:ready />
				{:else if step === 'data'}<StepData data={s} bind:payload bind:ready />
				{:else}<StepSummary data={s} {go} />
				{/if}
			{/key}
		</div>
	</main>

	<form method="POST" action="?/go" use:enhance={submit} bind:this={goForm} hidden>
		<input type="hidden" name="to" value={goTo} />
	</form>

	<footer>
		<form method="POST" action={step === 'summary' ? '?/finish' : '?/save'} use:enhance={submit} class="nav">
			<input type="hidden" name="step" value={step} />
			<input type="hidden" name="payload" value={JSON.stringify(payload)} />
			{#if idx > 0}
				<button type="button" class="btn ghost" disabled={busy} onclick={() => go(prevStep(step))} data-testid="back">{t('common.back')}</button>
			{:else}
				<span></span>
			{/if}
			<p class="error" role="alert">{error ?? ''}</p>
			{#if step === 'summary'}
				<button class="btn primary" disabled={busy} data-testid="finish">{t('common.done')}</button>
			{:else}
				<button class="btn primary" disabled={busy || !ready} data-testid="next">{t('common.next')}</button>
			{/if}
		</form>
	</footer>
</div>

<style>
	.setup {
		--s-h1: 52px;
		--s-h2: 30px;
		--s-title: 26px;
		--s-body: 21px;
		--s-small: 17px;
		--s-input: 26px;
		--h-control: 68px;
		--gutter: 64px;
		--content: 1440px;
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: auto 1fr auto;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-body);
		transition:
			background 0.2s,
			color 0.2s;
	}

	header {
		display: flex;
		align-items: center;
		gap: 48px;
		padding: 24px var(--gutter);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: grid;
		gap: 2px;
		flex: none;
	}
	.brand b {
		font: 600 30px var(--font-head);
	}
	.brand span {
		font-size: var(--s-small);
		color: var(--muted);
	}
	.progress {
		list-style: none;
		margin: 0 0 0 auto;
		padding: 0;
		display: flex;
		gap: 6px;
	}
	.progress button {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 60px;
		padding: 0 14px 0 8px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font: 500 var(--s-small) var(--font-body);
	}
	.progress button:disabled {
		cursor: default;
	}
	.progress .num {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid var(--line);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.progress .past button {
		color: var(--fg);
	}
	.progress .past .num {
		border-color: var(--fg);
	}
	.progress .now button {
		background: var(--card);
		color: var(--fg);
		font-weight: 700;
		box-shadow: var(--shadow);
		outline: 1px solid var(--line);
	}
	.progress .now .num {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--card);
	}
	.compact {
		display: none;
	}

	main {
		padding: 0 var(--gutter);
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}
	.inner {
		max-width: var(--content);
		margin: 0 auto;
		padding: 40px 0 48px;
		display: grid;
		gap: 28px;
		align-content: start;
	}
	.intro {
		display: grid;
		gap: 8px;
	}
	h1 {
		margin: 0;
		font: 600 var(--s-h1) / 1.1 var(--font-head);
		letter-spacing: -0.01em;
	}
	.lead {
		margin: 0;
		font-size: var(--s-body);
		color: var(--muted);
		max-width: 60ch;
		line-height: 1.4;
	}

	footer {
		border-top: 1px solid var(--line);
		padding: 20px var(--gutter);
		background: var(--bg);
	}
	.nav {
		max-width: var(--content);
		margin: 0 auto;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 24px;
	}
	.error {
		margin: 0;
		color: var(--alert);
		font-weight: 600;
		font-size: var(--s-body);
		text-align: center;
	}

	/* Wspólne elementy kroków */
	.setup :global(.btn) {
		font: 600 var(--s-title) var(--font-body);
		height: var(--h-control);
		padding: 0 32px;
		border-radius: var(--radius);
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		white-space: nowrap;
	}
	.setup :global(.btn.primary) {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--card);
		min-width: 260px;
	}
	.setup :global(.btn.ghost) {
		background: transparent;
	}
	.setup :global(.btn:disabled) {
		opacity: 0.4;
	}
	.setup :global(.btn:not(:disabled):active),
	.setup :global(.card:not(:disabled):active),
	.setup :global(.chip:active) {
		transform: translateY(1px);
	}
	.setup :global(.link) {
		justify-self: start;
		border: none;
		background: none;
		padding: 8px 0;
		min-height: 48px;
		font: 600 var(--s-body) var(--font-body);
		color: var(--fg);
		text-decoration: underline;
		text-underline-offset: 4px;
		text-decoration-color: var(--line);
	}
	.setup :global(.cards) {
		display: grid;
		gap: 16px;
	}
	.setup :global(.cards.two) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.setup :global(.cards.three) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.setup :global(.card) {
		display: grid;
		gap: 6px;
		text-align: left;
		padding: 22px 24px;
		border-radius: var(--radius);
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: inherit;
		box-shadow: var(--shadow);
	}
	.setup :global(.card.row) {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}
	.setup :global(.card:disabled) {
		opacity: 0.55;
		box-shadow: none;
		background: transparent;
	}
	.setup :global(.card.selected) {
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent),
			var(--shadow);
	}
	.setup :global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.setup :global(.chip) {
		min-height: 60px;
		padding: 8px 16px;
		border-radius: var(--radius-s);
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 500 var(--s-body) var(--font-body);
		text-align: left;
	}
	.setup :global(.chip.selected) {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--card);
		font-weight: 600;
	}
	.setup :global(.block) {
		display: grid;
		gap: 12px;
	}
	.setup :global(h2) {
		margin: 0;
		font: 600 var(--s-h2) var(--font-head);
	}
	.setup :global(.select) {
		display: grid;
		gap: 6px;
		max-width: 520px;
		font-size: var(--s-small);
		font-weight: 600;
		color: var(--muted);
	}
	.setup :global(select) {
		font: 500 var(--s-body) var(--font-body);
		height: var(--h-control);
		padding: 0 16px;
		border: 2px solid var(--line);
		border-radius: var(--radius-s);
		background: var(--card);
		color: var(--fg);
	}
	.setup :global(.hint) {
		margin: 0;
		font-size: var(--s-small);
		color: var(--muted);
		line-height: 1.45;
		max-width: 80ch;
	}
	.setup :global(.warn) {
		margin: 0;
		font-size: var(--s-body);
		color: var(--alert);
		font-weight: 600;
	}
	.setup :global(.muted) {
		color: var(--muted);
	}

	/* Telefon (przez Tailscale) i wąskie okna */
	@media (max-width: 1300px) {
		.progress .lbl {
			display: none;
		}
		.progress .now .lbl {
			display: inline;
		}
	}
	@media (max-width: 700px) {
		.setup {
			--s-h1: 30px;
			--s-h2: 21px;
			--s-title: 19px;
			--s-body: 17px;
			--s-small: 14px;
			--s-input: 18px;
			--h-control: 52px;
			--gutter: 16px;
		}
		header {
			gap: 16px;
			padding: 12px var(--gutter);
			justify-content: space-between;
		}
		.brand b {
			font-size: 20px;
		}
		.progress {
			display: none;
		}
		.compact {
			display: grid;
			gap: 6px;
			justify-items: end;
			font-size: var(--s-small);
			color: var(--muted);
		}
		.bar {
			width: 120px;
			height: 6px;
			border-radius: 3px;
			background: var(--line);
			overflow: hidden;
		}
		.bar span {
			display: block;
			height: 100%;
			background: var(--accent);
		}
		.inner {
			padding: 20px 0 28px;
			gap: 20px;
		}
		footer {
			padding: 12px var(--gutter) calc(12px + env(safe-area-inset-bottom));
		}
		.nav {
			grid-template-columns: auto 1fr;
			gap: 10px 12px;
		}
		.error {
			grid-column: 1 / -1;
			grid-row: 1;
			text-align: left;
		}
		.error:empty {
			display: none;
		}
		.setup :global(.btn) {
			padding: 0 18px;
		}
		.setup :global(.btn.primary) {
			min-width: 0;
			justify-self: stretch;
		}
		.setup :global(.cards.two),
		.setup :global(.cards.three) {
			grid-template-columns: 1fr;
		}
		.setup :global(.card) {
			padding: 16px 18px;
		}
		.setup :global(.chip) {
			min-height: 48px;
		}
	}
</style>
