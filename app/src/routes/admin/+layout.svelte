<script lang="ts">
	import '#lib/components/admin/admin.css';
	import { page } from '$app/state';
	import { rowStatus } from '#lib/components/admin/admin.svelte.js';
	import { t } from '#lib/i18n/index.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const here = $derived(page.url.pathname.replace(/\/$/, ''));
	const current = $derived(here === '/admin' ? t('admin.overview') : (data.nav.find((s) => here === `/admin/${s.slug}`)?.label ?? t('admin.panel')));
	// Na telefonie menu jest zwinięte; po przejściu na inną stronę zwija się samo.
	let open = $state(false);
	$effect(() => {
		void here;
		open = false;
	});
</script>

<svelte:head><title>{current} · {t('admin.panel')} · {t('common.appName')}</title></svelte:head>

<div class="scroll">
	<div class="shell">
		<aside class:open>
			<div class="brand">
				<strong>{t('admin.brand')}</strong>
				<button type="button" class="menu" aria-expanded={open} aria-controls="admin-nav" onclick={() => (open = !open)}>
					{current} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
				</button>
			</div>
			<nav id="admin-nav" aria-label={t('admin.sections')}>
				<a href="/admin" aria-current={here === '/admin' ? 'page' : undefined}>{t('admin.overview')}</a>
				{#each data.nav as s (s.slug)}
					<a href="/admin/{s.slug}" aria-current={here === `/admin/${s.slug}` ? 'page' : undefined}>{s.label}</a>
				{/each}
				<span class="who">{data.admin}</span>
			</nav>
		</aside>

		<div class="page">
			{#if data.demo}
				<p class="demo-banner" role="note" data-testid="demo-banner">
					{data.demo.reset ? t('demo.banner', { time: data.demo.reset }) : t('demo.bannerNoReset')}
				</p>
			{/if}
			{@render children()}
		</div>
	</div>
</div>

{#if rowStatus.current}
	<div class="toast" class:bad={!rowStatus.current.ok} role="status">{rowStatus.current.text}</div>
{/if}

<style>
	.scroll {
		position: fixed;
		inset: 0;
		overflow: auto;
		cursor: auto;
		user-select: text;
		font-size: 16px;
	}
	.shell {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		min-height: 100%;
	}
	aside {
		position: sticky;
		top: 0;
		align-self: start;
		height: 100dvh;
		overflow: auto;
		background: var(--card);
		border-right: 1px solid var(--line);
		padding: 18px 12px max(18px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
	}
	.brand strong {
		display: block;
		font-family: var(--font-head);
		font-size: 20px;
		padding: 0 10px 14px;
	}
	.menu {
		display: none;
	}
	nav {
		display: grid;
		gap: 2px;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		color: var(--fg);
		text-decoration: none;
		font-weight: 600;
	}
	nav a:hover {
		background: var(--event-bg);
	}
	nav a[aria-current='page'] {
		background: var(--fg);
		color: var(--card);
	}
	.who {
		margin-top: 14px;
		padding: 0 10px;
		color: var(--muted);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.demo-banner {
		margin: 0;
		padding: 10px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		border-left: 4px solid var(--accent, var(--fg));
		background: var(--card);
		font-size: 15px;
	}
	.page {
		max-width: 1280px;
		width: 100%;
		margin: 0 auto;
		padding: 24px 16px 80px;
		display: grid;
		gap: 40px;
		align-content: start;
		min-width: 0;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: max(20px, env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		z-index: 10;
		background: #1f8a4c;
		color: #fff;
		font-weight: 700;
		padding: 12px 22px;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		max-width: calc(100% - 32px);
	}
	.toast.bad {
		background: var(--alert);
	}

	/* Telefon: menu na górze, zwinięte do przycisku z nazwą bieżącej sekcji. */
	@media (max-width: 800px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
		aside {
			z-index: 5;
			height: auto;
			max-height: 100dvh;
			border-right: 0;
			border-bottom: 1px solid var(--line);
			padding: 10px max(16px, env(safe-area-inset-left, 0px));
		}
		.brand {
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.brand strong {
			padding: 0;
		}
		.menu {
			display: inline-flex;
			gap: 6px;
			margin-left: auto;
			font: 600 15px var(--font-body);
			padding: 8px 12px;
			border-radius: 8px;
			border: 1px solid var(--line);
			background: var(--event-bg);
			color: var(--fg);
		}
		nav {
			display: none;
			padding-top: 10px;
		}
		aside.open nav {
			display: grid;
		}
	}
</style>
