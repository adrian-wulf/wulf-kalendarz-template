<script lang="ts">
	import TileHeader from '#lib/components/kiosk/TileHeader.svelte';
	import type { Dashboard } from '#lib/types.js';
	import { t, tn } from '#lib/i18n/index.js';

	/** Kafelek: każde dziecko z punktami i paskiem postępu zadań na dziś. */
	let { data }: { data: Dashboard } = $props();
	const kids = $derived(data.modules.kids);
	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
</script>

<TileHeader icon="⭐" title={t('module.kids')} aside={kids?.pending ? tn('kids.pendingN', kids.pending) : undefined} />
<div class="kids" class:many={(kids?.kids.length ?? 0) > 2}>
	{#each kids?.kids ?? [] as k (k.memberId)}
		{@const m = memberById.get(k.memberId)}
		<div class="kid" style:--c={m?.color ?? 'var(--accent)'}>
			<div class="top">
				<span class="name">{m?.name}</span>
				<span class="pts">{k.points} <span class="star">⭐</span></span>
			</div>
			<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={k.total} aria-valuenow={k.done} aria-label={m?.name}>
				<span style:width="{k.total ? (k.done / k.total) * 100 : 0}%"></span>
			</div>
			<span class="sub">{k.total ? (k.done === k.total ? `✓ ${t('kids.allDone')}` : t('kids.progress', { done: k.done, total: k.total })) : t('kids.noTasks')}</span>
		</div>
	{:else}
		<p class="muted">{t('kids.noKids')}</p>
	{/each}
</div>

<style>
	.kids {
		display: grid;
		gap: 12px;
		align-content: start;
		container-type: inline-size;
	}
	.kid {
		display: grid;
		gap: 4px;
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.name {
		font: 700 26px var(--font-body);
		color: color-mix(in srgb, var(--c) 70%, var(--fg));
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pts {
		font: 800 28px var(--font-head);
		font-variant-numeric: tabular-nums;
	}
	.star {
		font-size: 22px;
	}
	.bar {
		height: 14px;
		border-radius: 7px;
		background: var(--event-bg);
		overflow: hidden;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
		border-radius: 7px;
		transition: width 0.4s ease;
	}
	.sub {
		font-size: 17px;
		font-weight: 600;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		font-size: 22px;
		margin: 0;
	}
	/* Więcej dzieci na szerokim kafelku: dwie kolumny. */
	@container (min-width: 520px) {
		.kids.many {
			grid-template-columns: 1fr 1fr;
			column-gap: 22px;
		}
	}
	@container (max-width: 260px) {
		.name,
		.pts {
			font-size: 22px;
		}
		.sub {
			font-size: 15px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar span {
			transition: none;
		}
	}
</style>
