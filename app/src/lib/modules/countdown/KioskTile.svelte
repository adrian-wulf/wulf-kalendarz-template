<script lang="ts">
	import TileHeader from '#lib/components/kiosk/TileHeader.svelte';
	import type { Dashboard } from '#lib/types.js';
	import { t, tn } from '#lib/i18n/index.js';

	/** Kafelek: 1–3 najbliższe odliczania z liczbą dni. */
	let { data }: { data: Dashboard } = $props();
	const cd = $derived(data.modules.countdown);
	const items = $derived(cd?.items.slice(0, cd.show) ?? []);
</script>

<TileHeader icon="⏳" title={t('module.countdown')} />
<div class="list">
	{#each items as c (c.id)}
		<div class="row" class:now={c.days === 0}>
			<span class="num">
				{#if c.days === 0}<b class="today">{t('countdown.today')}</b>{:else}<b>{c.days}</b><small>{tn('countdown.daysUnit', c.days)}</small>{/if}
			</span>
			<span class="what"><span class="emo">{c.emoji}</span>{c.title}</span>
		</div>
	{:else}
		<p class="muted">{t('countdown.empty')}</p>
	{/each}
</div>

<style>
	.list {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		flex: none;
		min-width: 0;
	}
	.num {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 74px;
		padding: 4px 8px;
		border-radius: var(--radius-s);
		background: var(--event-bg);
		line-height: 1;
		flex: none;
	}
	.num b {
		font: 800 32px var(--font-head);
		font-variant-numeric: tabular-nums;
	}
	.num small {
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
		margin-top: 2px;
	}
	.now .num {
		background: var(--fg);
		color: var(--card);
	}
	.now .num b.today {
		font-size: 20px;
		padding: 9px 0;
	}
	.what {
		font-size: 23px;
		font-weight: 600;
		line-height: 1.15;
		min-width: 0;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow-wrap: anywhere;
	}
	/* Wąski kafelek: mniejsza liczba i tytuł w dwóch linijkach. */
	@container (max-width: 300px) {
		.row {
			gap: 10px;
		}
		.num {
			min-width: 58px;
			padding: 3px 6px;
		}
		.num b {
			font-size: 26px;
		}
		.num small {
			font-size: 12px;
		}
		.what {
			font-size: 19px;
		}
		.emo {
			margin-right: 4px;
		}
	}
	@container (max-width: 220px) {
		.what {
			font-size: 17px;
		}
		.emo {
			display: none;
		}
	}
	.emo {
		margin-right: 8px;
	}
	.muted {
		color: var(--muted);
		font-size: 22px;
		margin: 0;
	}
</style>
