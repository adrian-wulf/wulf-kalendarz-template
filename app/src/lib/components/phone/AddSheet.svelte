<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { t } from '#lib/i18n/index.js';

	/** Okrągły „+” w rogu i panel dodawania wysuwany od dołu. */
	let { title, open = $bindable(false), children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<button type="button" class="fab" aria-label={title} onclick={() => (open = true)}>+</button>

{#if open}
	<div class="back" role="presentation" transition:fade={{ duration: 150 }} onclick={() => (open = false)}></div>
	<div class="sheet" role="dialog" aria-label={title} transition:fly={{ y: 300, duration: 200 }}>
		<header>
			<h2>{title}</h2>
			<button type="button" class="x" aria-label={t('common.close')} onclick={() => (open = false)}>✕</button>
		</header>
		<div class="body">{@render children()}</div>
	</div>
{/if}

<style>
	.fab {
		position: fixed;
		right: max(16px, calc(50vw - 304px));
		bottom: calc(84px + env(safe-area-inset-bottom));
		z-index: 15;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: none;
		background: var(--fg);
		color: var(--bg);
		font: 400 38px/1 var(--font-body);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
	}
	.back {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(20, 15, 10, 0.45);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 31;
		max-width: 640px;
		margin: 0 auto;
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border-radius: 20px 20px 0 0;
		padding-bottom: env(safe-area-inset-bottom);
	}
	header {
		display: flex;
		align-items: center;
		padding: 14px 16px 6px;
	}
	h2 {
		flex: 1;
		margin: 0;
		font: 800 22px var(--font-head);
	}
	.x {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: var(--line);
		color: var(--fg);
		font-size: 18px;
	}
	.body {
		overflow-y: auto;
		padding: 6px 16px 18px;
	}
</style>
