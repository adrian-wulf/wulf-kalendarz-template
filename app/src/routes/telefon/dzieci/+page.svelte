<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const k = $derived(data.kids);
	const nameOf = (id: string) => k.kids.find((x) => x.memberId === id)?.name ?? '?';
	let busy = $state(false);

	async function tap(taskId: number, done: boolean, title: string) {
		try {
			await api('/api/kids/done', 'POST', { taskId, done });
			await invalidateAll();
			if (done) say(`⭐ ${title}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}

	async function decide(id: number, approve: boolean) {
		busy = true;
		try {
			await api('/api/kids/decide', 'POST', { id, approve });
			await invalidateAll();
			say(approve ? `✓ ${t('kids.approve')}` : `✕ ${t('kids.reject')}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}
</script>

{#if k.pending.length}
	<div class="ph-label first">🎁 {t('kids.pending')}</div>
	{#each k.pending as p (p.id)}
		<div class="ph-card req">
			<div class="what"><b>{p.emoji} {p.title}</b><span class="ph-muted">{nameOf(p.memberId)} · {tn('kids.pts', p.cost)}</span></div>
			{#if data.parent}
				<div class="ph-row">
					<button type="button" class="ph-btn" disabled={busy} onclick={() => decide(p.id, false)}>{t('kids.reject')}</button>
					<button type="button" class="ph-btn primary" disabled={busy} onclick={() => decide(p.id, true)}>✓ {t('kids.approve')}</button>
				</div>
			{/if}
		</div>
	{/each}
	{#if !data.parent}<p class="ph-muted small">{t('kids.parentOnly')}</p>{/if}
{/if}

{#each k.kids as kid (kid.memberId)}
	<div class="ph-card kid" style:--c={kid.color}>
		<div class="top">
			<b class="name">{kid.name}</b>
			<span class="pts">{kid.points} ⭐</span>
		</div>
		<div class="bar"><span style:width="{kid.total ? (kid.done / kid.total) * 100 : 0}%"></span></div>
		<p class="ph-muted small">{kid.total ? t('kids.progress', { done: kid.done, total: kid.total }) : t('kids.noTasks')}</p>
		{#each kid.tasks as task (task.id)}
			<button type="button" class="task" class:done={task.done} aria-pressed={task.done} onclick={() => tap(task.id, !task.done, task.title)}>
				<span class="emo">{task.emoji}</span>
				<span class="title">{task.title}{#if task.repeat.type === 'weekly'}<small class="ph-muted wk">{t('kids.thisWeek')}</small>{/if}</span>
				<span class="earn">{task.done ? '✓' : `+${task.points}`}</span>
			</button>
		{/each}
	</div>
{:else}
	<p class="ph-muted">{t('kids.noKids')}</p>
	<!-- --- 26b: guides --- pusty stan: administrator może od razu przejść do panelu -->
	{#if page.data.isAdmin}<p><a class="ph-btn" href="/admin/dzieci" data-sveltekit-reload>{t('empty.phone.panel')} ›</a></p>{/if}
{/each}

{#if k.rewards.length}
	<div class="ph-label">🎁 {t('kids.rewards')}</div>
	<div class="ph-card">
		{#each k.rewards as r (r.id)}
			<div class="reward"><span>{r.emoji} {r.title}</span><b>{r.cost} ⭐</b></div>
		{/each}
	</div>
{/if}

<style>
	.first {
		margin-top: 4px;
	}
	.req {
		display: grid;
		gap: 10px;
	}
	.what {
		display: grid;
	}
	.small {
		font-size: 14px;
		margin: 4px 0 8px;
	}
	.kid {
		border-top: 5px solid var(--c);
	}
	.top {
		display: flex;
		align-items: baseline;
	}
	.name {
		flex: 1;
		font: 800 22px var(--font-head);
		color: color-mix(in srgb, var(--c) 70%, var(--fg));
	}
	.pts {
		font: 800 22px var(--font-head);
	}
	.bar {
		height: 10px;
		border-radius: 5px;
		background: var(--event-bg);
		overflow: hidden;
		margin-top: 6px;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
	}
	.task {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		padding: 12px;
		margin-top: 8px;
		border-radius: 12px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 600 17px var(--font-body);
	}
	.task.done {
		background: color-mix(in srgb, var(--c) 18%, var(--card));
		border-color: var(--c);
	}
	.task.done .title {
		text-decoration: line-through;
	}
	.emo {
		font-size: 26px;
	}
	.title {
		flex: 1;
	}
	.wk {
		display: block;
		font-weight: 500;
	}
	.earn {
		font-weight: 800;
		min-width: 36px;
		text-align: center;
	}
	.reward {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
</style>
