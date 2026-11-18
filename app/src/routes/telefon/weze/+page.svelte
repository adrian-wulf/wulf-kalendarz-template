<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Fold from '#lib/components/phone/Fold.svelte';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { addDays } from '#lib/logic/dates.js';
	import { agoLabel, feedShort, intervalLabel, type SnakeEventType, type SnakeView } from '#lib/logic/snakes.js';
	import { fmtShortDate } from '#lib/format.js';
	import { inSentence, t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const label = (type: SnakeEventType) => t(`snakes.event.${type}`);
	const ICON: Record<SnakeEventType, string> = { feed: '🍽', refused: '✋', shed: '🐍', clean: '🧽', weight: '⚖️' };
	const short = fmtShortDate;
	const foodLabel = (id: string | null) => data.food.find((f) => f.id === id)?.label ?? '';
	const sx = (s: SnakeView) => (s.sex === 'F' ? 'F' : 'M');

	let openId = $state<string | null>(null);
	let food = $state<string | null>(null);
	let grams = $state('');
	let pauseDay = $state('');

	function toggle(s: SnakeView) {
		openId = openId === s.id ? null : s.id;
		food = s.lastFood;
		grams = '';
		pauseDay = s.pauseUntil ?? addDays(data.today, 7);
	}

	async function record(s: SnakeView, type: SnakeEventType) {
		try {
			const row = await api<{ id: number }>('/api/snakes/events', 'POST', { snakeId: s.id, type, food: type === 'feed' ? food : null, grams: type === 'weight' ? Number(grams) : null });
			openId = null;
			await invalidateAll();
			const extra = type === 'feed' && food ? ` (${foodLabel(food)})` : type === 'weight' ? ` ${grams} g` : '';
			say(`${ICON[type]} ${s.name}: ${inSentence(label(type))}${extra}`, {
				ms: 8000,
				undo: async () => {
					await api(`/api/snakes/events/${row.id}`, 'DELETE');
					await invalidateAll();
					say(t('phone.undone'));
				}
			});
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}

	async function pause(s: SnakeView, until: string | null) {
		await api('/api/snakes/pause', 'POST', { snakeId: s.id, until });
		openId = null;
		await invalidateAll();
		say(until ? `⏸ ${t('snakes.toastPaused', { name: s.name, date: short(until) })}` : `▶ ${t('snakes.toastResumed', { name: s.name })}`);
	}

	async function stock(id: string, delta: 1 | -1) {
		await api('/api/snakes/stock', 'POST', { food: id, delta });
		await invalidateAll();
	}
</script>

{#each data.snakes as s (s.id)}
	<div class="snake {s.state}" style:--c={s.color}>
		<button type="button" class="head" onclick={() => toggle(s)}>
			<span class="name">{s.name}</span>
			<span class="due">{feedShort(s, data.today)}</span>
			<span class="sub ph-muted">🍽 {agoLabel(s.lastFeed, data.today)}{s.lastFood ? ` · ${foodLabel(s.lastFood)}` : ''} · {intervalLabel(s)}{s.lastRefused ? ` · ✋ ${t(`snakes.refused.${sx(s)}`, { when: agoLabel(s.lastRefused, data.today) })}` : ''}</span>
		</button>
		{#if openId === s.id}
			<div class="body">
				<div class="chips">
					{#each data.food as f (f.id)}
						<button type="button" class="chip" class:on={food === f.id} class:empty={f.count === 0} onclick={() => (food = food === f.id ? null : f.id)}>{f.label} ({f.count})</button>
					{/each}
				</div>
				<div class="grid">
					<button type="button" class="ph-btn primary" onclick={() => record(s, 'feed')}>🍽 {t(`snakes.fed.${sx(s)}`)}</button>
					<button type="button" class="ph-btn" onclick={() => record(s, 'refused')}>✋ {t(`snakes.refusedBtn.${sx(s)}`)}</button>
					<button type="button" class="ph-btn" onclick={() => record(s, 'shed')}>🐍 {label('shed')}</button>
					<button type="button" class="ph-btn" onclick={() => record(s, 'clean')}>🧽 {label('clean')}</button>
				</div>
				<div class="ph-row line">
					<input class="ph-input" type="number" inputmode="numeric" min="1" placeholder={t('snakes.weightPlaceholder')} bind:value={grams} />
					<button type="button" class="ph-btn" disabled={!grams} onclick={() => record(s, 'weight')}>⚖️ {t('common.save')}</button>
				</div>
				<div class="ph-row line">
					{#if s.pauseUntil}
						<button type="button" class="ph-btn wide" onclick={() => pause(s, null)}>▶ {t('snakes.resume')}</button>
					{:else}
						<input class="ph-input" type="date" min={addDays(data.today, 1)} bind:value={pauseDay} />
						<button type="button" class="ph-btn" onclick={() => pause(s, pauseDay)}>⏸ {t('snakes.pauseShort')}</button>
					{/if}
				</div>
				<div class="ph-label">{t('snakes.recent')}</div>
				<ul>
					{#each s.events.slice(0, 6) as e (e.id)}
						<li><b>{short(e.date)}</b> {ICON[e.type]} {label(e.type)}{e.food ? ` · ${foodLabel(e.food)}` : ''}{e.grams ? ` · ${e.grams} g` : ''}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/each}

<Fold
	id="weze-karmowka"
	title="🐭 {t('snakes.food')}"
	aside={data.food.some((f) => f.count < f.minCount)
		? t('snakes.missing', { n: data.food.filter((f) => f.count < f.minCount).length })
		: tn('pantry.pieces', data.food.reduce((n, f) => n + f.count, 0))}
>
<div class="food">
	{#each data.food as f (f.id)}
		<div class="stock" class:low={f.count < f.minCount}>
			<button type="button" onclick={() => stock(f.id, -1)} disabled={f.count === 0} aria-label={t('pantry.less')}>−</button>
			<span><b>{f.count}</b> × {f.label}</span>
			<button type="button" onclick={() => stock(f.id, 1)} aria-label={t('pantry.more')}>+</button>
		</div>
	{/each}
</div>
</Fold>

<style>
	.snake {
		background: var(--card);
		border-radius: 16px;
		border-left: 8px solid var(--c);
		margin-bottom: 10px;
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.snake.due {
		outline: 2px solid #e8590c;
	}
	.snake.paused {
		opacity: 0.75;
	}
	.head {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 10px;
		text-align: left;
		padding: 12px 14px;
		border: none;
		background: none;
		color: var(--fg);
		font-family: var(--font-body);
	}
	.name {
		font: 800 21px var(--font-head);
	}
	.due {
		font-weight: 800;
		align-self: center;
	}
	.snake.due .due {
		color: #c2410c;
	}
	.sub {
		grid-column: 1 / -1;
		font-size: 14px;
	}
	.body {
		padding: 0 14px 14px;
	}
	.chip.empty {
		opacity: 0.45;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
	}
	.line {
		margin-top: 8px;
	}
	.line .ph-input {
		flex: 1;
	}
	.wide {
		flex: 1;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 15px;
		display: grid;
		gap: 4px;
	}
	.food {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 8px;
	}
	.stock {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		background: var(--card);
		border: 2px solid var(--line);
		border-radius: 12px;
		padding: 4px;
		font-size: 15px;
		min-width: 0;
	}
	.stock.low {
		border-color: var(--alert);
		color: var(--alert);
	}
	.stock span {
		flex: 1;
		min-width: 0;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stock b {
		font-size: 18px;
	}
	.stock button {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: none;
		background: var(--bg);
		color: var(--fg);
		font: 700 22px var(--font-body);
	}
	.stock button:disabled {
		opacity: 0.3;
	}
</style>
