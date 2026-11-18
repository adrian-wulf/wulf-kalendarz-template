<script lang="ts">
	import { addDays } from '#lib/logic/dates.js';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	/** Wybór dnia: dwa tygodnie od dziś jako duże przyciski. */
	let { today, value = $bindable() }: { today: string; value: string } = $props();

	const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(today, i)));
	const label = (d: string, i: number) => (i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : dayHeader(d).wd);
</script>

<div class="days">
	{#each days as d, i (d)}
		<button type="button" class="day" class:on={value === d} onclick={() => (value = d)}>
			<span class="wd">{label(d, i)}</span>
			<span class="num">{fmtShortDate(d)}</span>
		</button>
	{/each}
</div>

<style>
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 12px;
	}
	.day {
		height: 104px;
		border-radius: 16px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: var(--font-body);
	}
	.wd {
		font-size: 24px;
		font-weight: 600;
		color: var(--muted);
	}
	.num {
		font: 800 34px var(--font-head);
	}
	.on {
		background: var(--fg);
		border-color: var(--fg);
	}
	.on .wd,
	.on .num {
		color: var(--card);
	}
</style>
