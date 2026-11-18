<script lang="ts">
	import Sheet from '#lib/components/kiosk/Sheet.svelte';
	import { dayHeader, fmtDayMonth } from '#lib/format.js';
	import type { Dashboard } from '#lib/types.js';
	import { t, tn } from '#lib/i18n/index.js';

	/** Wszystkie nadchodzące odliczania w dużych kartach (dodawanie: telefon i panel). */
	let { data, onclose }: { data: Dashboard; onclose: () => void } = $props();
	const items = $derived(data.modules.countdown?.items ?? []);
	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
</script>

<Sheet title="⏳ {t('module.countdown')}" {onclose} closeLabel="✕ {t('common.close')}">
	<div class="grid">
		{#each items as c (c.id)}
			<div class="card" class:now={c.days === 0} style:--c={c.memberId ? memberById.get(c.memberId)?.color : undefined}>
				<span class="emo">{c.emoji}</span>
				<div class="txt">
					<b>{c.title}</b>
					<span>{dayHeader(c.next).wd}, {fmtDayMonth(c.next)}</span>
				</div>
				<div class="num">
					{#if c.days === 0}<b>{t('countdown.today')}</b>{:else}<b>{c.days}</b><small>{tn('countdown.daysUnit', c.days)}</small>{/if}
				</div>
			</div>
		{:else}
			<p class="muted">{t('countdown.empty')}</p>
		{/each}
	</div>
	<p class="hint">{t('countdown.addHint')}</p>
</Sheet>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
		gap: 18px;
		overflow-y: auto;
		touch-action: pan-y;
		min-height: 0;
		align-content: start;
	}
	.card {
		display: flex;
		align-items: center;
		gap: 22px;
		padding: 18px 22px;
		border-radius: 20px;
		background: var(--card);
		border-left: 10px solid var(--c, var(--line));
	}
	.emo {
		font-size: 64px;
		line-height: 1;
	}
	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.txt b {
		font-size: 32px;
		overflow-wrap: anywhere;
	}
	.txt span {
		font-size: 22px;
		color: var(--muted);
	}
	.num {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 110px;
		padding: 8px 14px;
		border-radius: 16px;
		background: var(--event-bg);
		line-height: 1;
	}
	.num b {
		font: 800 56px var(--font-head);
		font-variant-numeric: tabular-nums;
	}
	.num small {
		font-size: 20px;
		font-weight: 600;
		color: var(--muted);
		margin-top: 4px;
	}
	.now .num {
		background: var(--fg);
		color: var(--card);
	}
	.now .num b {
		font-size: 34px;
		padding: 14px 0;
	}
	.grid {
		flex: 1;
	}
	.hint {
		margin: 0;
		font-size: 22px;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		font-size: 30px;
		margin: 0;
	}
</style>
