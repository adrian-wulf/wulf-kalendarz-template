<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.js';

	/**
	 * Tryb demo: sekcja tylko do podglądu (Google, Bring!, Home Assistant, kopie, dostęp) – informacja
	 * nad nią, a formularze nieaktywne (`inert`). Serwer i tak odrzuca te akcje (`demo/mode.ts`).
	 * Poza demo – sama zawartość.
	 */
	let { children, pin = false }: { children: Snippet; pin?: boolean } = $props();
	const demo = $derived((page.data as { demo?: { pin: string } | null }).demo ?? null);
</script>

{#if demo}
	<div class="demo-lock" data-testid="demo-lock">
		<p class="note" role="note">
			{t('demo.lockedSection')}
			{#if pin}<br /><b>{t('demo.pin', { pin: demo.pin })}</b>{/if}
		</p>
		<div class="locked" inert>{@render children()}</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.demo-lock {
		display: grid;
		gap: 14px;
	}
	.note {
		margin: 0;
		padding: 10px 14px;
		border-radius: 10px;
		border: 1px dashed var(--muted);
		background: var(--card);
		font-size: 15px;
	}
	.locked {
		opacity: 0.6;
		filter: grayscale(0.3);
	}
</style>
