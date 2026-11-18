<script lang="ts">
	import { t } from '#lib/i18n/index.js';

	/** Nagłówek kafelka modułu (ten sam wygląd co zakupy/kartki/zadania): ikona, nazwa, licznik, „wszystkie”. */
	let { icon, title, count, aside }: { icon: string; title: string; count?: number; aside?: string } = $props();
</script>

<header>
	<h3>{icon} {title}{#if count} <span class="n">{count}</span>{/if}</h3>
	<span class="all">{aside ?? t('common.all')}</span>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 10px;
		min-height: var(--tile-head, 56px);
		container-type: inline-size;
	}
	h3 {
		margin: 0;
		font-family: var(--font-head);
		font-size: 20px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.n {
		display: inline-block;
		min-width: 30px;
		padding: 0 8px;
		border-radius: 999px;
		background: var(--line);
		color: var(--fg);
		text-align: center;
		letter-spacing: 0;
	}
	.all {
		margin-left: auto;
		font: 600 19px var(--font-body);
		color: var(--muted);
		white-space: nowrap;
	}
	/* Wąski kafelek: bez „wszystkie ›” – cały kafelek i tak otwiera okno. */
	@container (max-width: 360px) {
		.all {
			display: none;
		}
	}
	@container (max-width: 300px) {
		h3 {
			font-size: 18px;
			letter-spacing: 0.04em;
		}
	}
</style>
