<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.js';

	// Brak strony (np. wyłączony moduł) – nie ma na co czekać.
	const missing = $derived(page.status === 404);

	// Kiosk nie może utknąć na błędzie (np. restart aplikacji przy wdrożeniu) – próbujemy ponownie.
	onMount(() => {
		if (page.status === 404) return;
		const timer = setInterval(async () => {
			try {
				if ((await fetch(location.href, { method: 'HEAD', cache: 'no-store' })).ok) location.reload();
			} catch {
				/* serwer jeszcze nie wstał */
			}
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

<main>
	<div class="box">
		{#if missing}
			<h1>{t('error.notFound')}</h1>
			<p><a href="/">← {t('common.appName')}</a></p>
		{:else}
			<h1>{t('error.wait')}</h1>
			<p>{t('error.reconnecting')}</p>
		{/if}
		<small>{page.status} {page.error?.message ?? ''}</small>
	</div>
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-body);
	}
	.box {
		text-align: center;
	}
	h1 {
		font: 800 72px var(--font-head);
		margin: 0 0 12px;
	}
	p {
		font-size: 36px;
		margin: 0 0 24px;
	}
	a {
		color: inherit;
	}
	small {
		color: var(--muted);
		font-size: 20px;
	}
</style>
