<script lang="ts">
	import TileHeader from '#lib/components/kiosk/TileHeader.svelte';
	import type { Dashboard } from '#lib/types.js';
	import { t } from '#lib/i18n/index.js';

	/** Kafelek: co dziś i jutro na obiad (i/lub kolację). */
	let { data }: { data: Dashboard } = $props();
	const meals = $derived(data.modules.meals);
	const two = $derived(meals?.days.slice(0, 2) ?? []);
	const many = $derived((meals?.slots.length ?? 1) > 1);
</script>

<TileHeader icon="🍽️" title={t('module.meals')} />
<div class="days">
	{#each two as d, i (d.date)}
		<div class="day" class:today={i === 0}>
			<span class="when">{i === 0 ? t('common.today') : t('common.tomorrow')}</span>
			{#each d.meals as m (m.slot)}
				<div class="meal" class:empty={!m.name}>
					<span class="emo">{m.name ? m.emoji : '·'}</span>
					<span class="name">{#if many}<small>{t(`meals.slot.${m.slot}`)}</small>{/if}{m.name || t('meals.nothing')}</span>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.days {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.day {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: none;
	}
	.when {
		font: 700 16px var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.meal {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 25px;
		min-width: 0;
	}
	.today .meal {
		font-weight: 650;
	}
	.meal.empty {
		color: var(--muted);
		font-weight: 400;
		font-size: 22px;
	}
	.emo {
		font-size: 30px;
		width: 38px;
		text-align: center;
		flex: none;
	}
	.name {
		min-width: 0;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	/* Wąski kafelek (wiele modułów, mały ekran): mniejsze litery, bez ikon dań. */
	@container (max-width: 300px) {
		.meal {
			font-size: 22px;
			gap: 8px;
		}
		.emo {
			font-size: 24px;
			width: 28px;
		}
		.days {
			gap: 6px;
		}
	}
	@container (max-width: 230px) {
		.emo {
			display: none;
		}
	}
	small {
		font-size: 16px;
		font-weight: 600;
		color: var(--muted);
		margin-right: 8px;
	}
</style>
