<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { me, chooseMember, rememberedMember } from '#lib/phone/me.svelte.js';
	import { toast, hideToast } from '#lib/phone/toast.svelte.js';
	import { phoneTabs } from '#lib/modules/index.js';
	import { t } from '#lib/i18n/index.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Zakładki aktywnych modułów (manifest: `phone`), w kolejności z panelu.
	const TABS = $derived(phoneTabs(data.enabled).map((m) => [m.phone!.path, m.icon, m.phone!.label] as const));
	// Na pasku mieści się najwyżej 5 zakładek; przy większej liczbie 4 pierwsze + „Więcej” z resztą.
	const MAX_TABS = 5;
	const BAR = $derived(TABS.length > MAX_TABS ? TABS.slice(0, MAX_TABS - 1) : TABS);
	const MORE = $derived(TABS.length > MAX_TABS ? TABS.slice(MAX_TABS - 1) : []);
	const isOn = (id: string) => page.url.pathname.startsWith(`/telefon/${id}`);
	let moreOpen = $state(false);
	// Po przejściu na inną stronę menu „Więcej” się zamyka.
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
	});

	// Domownik: z Tailscale ma pierwszeństwo, inaczej zapamiętany wybór.
	$effect(() => {
		if (data.autoMember) me.id = data.autoMember;
		else if (!me.id) me.id = data.chosenMember ?? rememberedMember();
	});
	const member = $derived(data.members.find((m) => m.id === me.id) ?? null);
	let picking = $state(false);

	onMount(() => {
		const root = document.documentElement;
		root.classList.add('phone');
		// Jasny/ciemny jak w telefonie (te same kolory co kiosk wieczorem).
		const dark = matchMedia('(prefers-color-scheme: dark)');
		const apply = () => (root.dataset.phase = dark.matches ? 'night' : 'day');
		apply();
		dark.addEventListener('change', apply);
		// Po powrocie do aplikacji – świeże dane.
		const onVisible = () => document.visibilityState === 'visible' && invalidateAll();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			dark.removeEventListener('change', apply);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<svelte:head>
	<title>{t('phone.title')}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content={data.theme.day} media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content={data.theme.evening} media="(prefers-color-scheme: dark)" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content={t('phone.home')} />
	<link rel="manifest" href="/telefon.webmanifest" />
	<link rel="apple-touch-icon" href="/ikona-180.png" />
</svelte:head>

<div class="app">
	<header>
		<h1>{TABS.find(([id]) => page.url.pathname.startsWith(`/telefon/${id}`))?.[2] ?? t('phone.home')}</h1>
		<button type="button" class="who" style:--c={member?.color ?? 'var(--muted)'} onclick={() => (picking = !picking)} disabled={!!data.autoMember}>
			<span class="dot"></span>{member?.name ?? t('phone.whoAreYou')}
		</button>
	</header>

	{#if (!member && !data.autoMember) || picking}
		<div class="pick">
			<p>{t('phone.pickMember')}</p>
			<div class="chips">
				{#each data.members as m (m.id)}
					<button type="button" class="chip" style:--c={m.color} onclick={() => (chooseMember(m.id), (picking = false))}><span class="dot"></span>{m.name}</button>
				{/each}
			</div>
			<!-- --- p4: security --- tryb hasła: wylogowanie z tego telefonu -->
			{#if data.canLogout}
				<form method="POST" action="/logout" class="logout"><button type="submit" class="chip">{t('sec.logout')}</button></form>
			{/if}
		</div>
	{/if}

	<main>{@render children()}</main>

	{#if moreOpen && MORE.length}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="more-back" onclick={() => (moreOpen = false)}></div>
		<div class="more" id="phone-more">
			{#each MORE as [id, icon, label] (id)}
				<a href="/telefon/{id}" class:on={isOn(id)} aria-current={isOn(id) ? 'page' : undefined}>
					<span class="ic">{icon}</span>{label}
				</a>
			{/each}
		</div>
	{/if}

	<nav class:above={moreOpen} style:grid-template-columns="repeat({Math.max(1, BAR.length + (MORE.length ? 1 : 0))}, minmax(0, 1fr))">
		{#each BAR as [id, icon, label] (id)}
			<a href="/telefon/{id}" class:on={isOn(id)} aria-current={isOn(id) ? 'page' : undefined}>
				<span class="ic">{icon}</span><span class="lb">{label}</span>
			</a>
		{/each}
		{#if MORE.length}
			<button type="button" class="more-btn" class:on={moreOpen || MORE.some(([id]) => isOn(id))} aria-expanded={moreOpen} aria-controls="phone-more" onclick={() => (moreOpen = !moreOpen)}>
				<span class="ic">⋯</span><span class="lb">{t('phone.more')}</span>
			</button>
		{/if}
	</nav>

	{#if toast.text}
		{#key toast.id}
			<div class="toast" class:error={toast.error} transition:fly={{ y: 40, duration: 180 }}>
				<span>{toast.text}</span>
				{#if toast.undo}<button type="button" onclick={toast.undo}>{t('phone.undo')}</button>{:else}<button type="button" onclick={hideToast}>{t('common.ok')}</button>{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.app {
		max-width: 640px;
		margin: 0 auto;
		min-height: 100dvh;
		padding: env(safe-area-inset-top) 16px calc(160px + env(safe-area-inset-bottom));
		font-size: 17px;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 0 10px;
		background: var(--bg);
	}
	h1 {
		margin: 0;
		font: 800 30px var(--font-head);
	}
	.who {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		font: 600 16px var(--font-body);
		padding: 8px 14px;
		border-radius: 999px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	.who:disabled {
		opacity: 1;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--c);
		flex: none;
	}
	.pick {
		background: var(--card);
		border-radius: 16px;
		padding: 14px 16px;
		margin-bottom: 14px;
		box-shadow: var(--shadow);
	}
	.pick p {
		margin: 0 0 10px;
	}
	.pick .logout {
		margin-top: 12px;
	}
	nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		display: grid;
		background: var(--card);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
	}
	nav.above {
		z-index: 17;
	}
	nav a,
	nav .more-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 0;
		padding: 10px 2px 8px;
		font: 600 13px var(--font-body);
		color: var(--muted);
		text-decoration: none;
		border: none;
		background: none;
	}
	nav .lb {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	nav a.on,
	nav .more-btn.on {
		color: var(--fg);
	}
	nav .ic,
	.more .ic {
		font-size: 24px;
		line-height: 1.15;
		filter: grayscale(1);
		opacity: 0.6;
	}
	nav a.on .ic,
	nav .more-btn.on .ic,
	.more a.on .ic {
		filter: none;
		opacity: 1;
	}
	nav .more-btn .ic {
		filter: none;
		font-weight: 800;
	}
	/* „Więcej”: reszta zakładek nad paskiem */
	/* nad przyciskiem „+” stron (z-index 15), pod oknem dodawania (30) */
	.more-back {
		position: fixed;
		inset: 0;
		z-index: 16;
		background: rgba(0, 0, 0, 0.25);
	}
	.more {
		position: fixed;
		right: max(12px, calc(50% - 308px));
		bottom: calc(76px + env(safe-area-inset-bottom));
		z-index: 17;
		min-width: 220px;
		max-height: 60dvh;
		overflow-y: auto;
		padding: 6px;
		border-radius: 16px;
		background: var(--card);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
	}
	.more a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		font: 600 17px var(--font-body);
		color: var(--fg);
		text-decoration: none;
	}
	.more a.on {
		background: var(--bg);
	}
	.toast {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: calc(80px + env(safe-area-inset-bottom));
		z-index: 20;
		max-width: 608px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px 10px 16px;
		border-radius: 14px;
		background: var(--fg);
		color: var(--bg);
		font-weight: 600;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
	}
	.toast span {
		flex: 1;
	}
	.toast.error {
		background: var(--alert);
		color: #fff;
	}
	.toast button {
		font: 700 15px var(--font-body);
		padding: 10px 14px;
		border-radius: 10px;
		border: none;
		background: var(--bg);
		color: var(--fg);
	}

	/* Wspólne elementy stron telefonu */
	:global(.ph-card) {
		background: var(--card);
		border-radius: 16px;
		padding: 14px 16px;
		box-shadow: var(--shadow);
		margin-bottom: 12px;
	}
	:global(.ph-label) {
		font: 700 13px var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin: 20px 0 8px;
	}
	:global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	:global(.chip) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 600 15px var(--font-body);
		padding: 9px 13px;
		border-radius: 999px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	:global(.chip.on) {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}
	:global(.ph-input) {
		width: 100%;
		font: 17px var(--font-body);
		padding: 12px 14px;
		border-radius: 12px;
		border: 2px solid var(--line);
		background: var(--bg);
		color: var(--fg);
	}
	:global(.ph-input:focus) {
		outline: none;
		border-color: var(--fg);
	}
	:global(.ph-btn) {
		font: 700 17px var(--font-body);
		padding: 13px 18px;
		border-radius: 12px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	:global(.ph-btn.primary) {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}
	:global(.ph-btn:disabled) {
		opacity: 0.4;
	}
	:global(.ph-muted) {
		color: var(--muted);
	}
	:global(.ph-row) {
		display: flex;
		gap: 10px;
		align-items: center;
	}
</style>
