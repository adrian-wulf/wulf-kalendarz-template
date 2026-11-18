<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import AddSheet from '#lib/components/phone/AddSheet.svelte';
	import Fold from '#lib/components/phone/Fold.svelte';
	import { me } from '#lib/phone/me.svelte.js';
	import { api, deferred, say } from '#lib/phone/toast.svelte.js';
	import { addDays, isoWeekday } from '#lib/logic/dates.js';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const REPEAT = [
		['once', () => t('chores.once')],
		['weekly', () => t('repeat.weekly')],
		['monthly', () => t('repeat.monthly')]
	] as const;

	let title = $state('');
	let who = $state<string | null | undefined>(undefined); // undefined = jeszcze nie wybrano → ja
	let date = $state('');
	let repeat = $state<(typeof REPEAT)[number][0]>('once');
	let busy = $state(false);
	let adding = $state(false);
	const assignee = $derived(who === undefined ? me.id : who);
	const day = $derived(date || data.today);

	const hidden = new SvelteSet<string>();
	const member = (id: string | null) => data.members.find((m) => m.id === id);

	function dayLabel(d: string) {
		if (d === addDays(data.today, 1)) return t('common.tomorrow');
		return `${dayHeader(d).wd} ${fmtShortDate(d)}`;
	}
	const repeatHint = $derived(
		repeat === 'weekly'
			? t('chores.repeatsWeekly', { weekday: t('date.weekdaysOn').split(',')[isoWeekday(day) - 1] })
			: repeat === 'monthly'
				? t('chores.repeatsMonthly', { day: Number(day.slice(8)) })
				: ''
	);

	const groups = $derived.by(() => {
		const m = new Map<string, typeof data.upcoming>();
		for (const u of data.upcoming.filter((u) => !hidden.has(u.key))) m.set(u.date, [...(m.get(u.date) ?? []), u]);
		return [...m];
	});

	function check(key: string, title: string) {
		deferred(hidden, key, `✓ ${title}`, () => api('/api/tasks/done', 'POST', { key }).then(() => invalidateAll()));
	}

	async function add() {
		busy = true;
		try {
			await api('/api/chores', 'POST', { title, memberId: assignee, date: day, repeat });
			title = '';
			adding = false;
			await invalidateAll();
			say(`✅ ${t('chores.added')}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}
</script>

<div class="ph-label first">{t('common.today')}</div>
{#each data.tasks.filter((x) => !hidden.has(x.key)) as task (task.key)}
	<button type="button" class="task" style:--c={task.bin ? task.binColor : (member(task.memberId)?.color ?? 'var(--line)')} onclick={() => check(task.key, task.title)}>
		<span class="box"></span>
		<span class="title">{task.kind === 'waste' ? '🗑 ' : ''}{task.title}</span>
		{#if task.overdue}<span class="late">{t('list.overdue')}</span>{/if}
		{#if member(task.memberId)}<span class="who">{member(task.memberId)?.name}</span>{/if}
	</button>
{:else}
	<p class="ph-muted">{t('kiosk.choresDone')} 🎉</p>
{/each}

{#if groups.length}
	<Fold id="zadania-najblizsze" title="📆 {t('chores.next7')}" aside={String(groups.reduce((n, [, l]) => n + l.length, 0))}>
	{#each groups as [d, list] (d)}
		<div class="day">{dayLabel(d)}</div>
		{#each list as u (u.key)}
			<button type="button" class="task soon" style:--c={member(u.memberId)?.color ?? 'var(--line)'} onclick={() => check(u.key, u.title)}>
				<span class="box"></span>
				<span class="title">{u.title}</span>
				{#if member(u.memberId)}<span class="who">{member(u.memberId)?.name}</span>{/if}
			</button>
		{/each}
	{/each}
	</Fold>
{/if}

<AddSheet title={t('add.chore.title')} bind:open={adding}>
	<form onsubmit={(e) => (e.preventDefault(), add())}>
		<input class="ph-input" bind:value={title} maxlength="80" placeholder={t('add.chore.what')} />
		<div class="ph-label">{t('chores.forWhom')}</div>
		<div class="chips">
			{#each data.members as m (m.id)}
				<button type="button" class="chip" class:on={assignee === m.id} onclick={() => (who = m.id)}><span class="dot" style:--c={m.color}></span>{m.name}</button>
			{/each}
			<button type="button" class="chip" class:on={assignee === null} onclick={() => (who = null)}>{t('add.anyoneTile')}</button>
		</div>
		<div class="ph-label">{t('chores.when')}</div>
		<input class="ph-input" type="date" value={day} min={data.today} oninput={(e) => (date = e.currentTarget.value)} />
		<div class="chips repeat">
			{#each REPEAT as [id, label] (id)}
				<button type="button" class="chip" class:on={repeat === id} onclick={() => (repeat = id)}>{label()}</button>
			{/each}
		</div>
		{#if repeatHint}<p class="ph-muted hint">{repeatHint}</p>{/if}
		<button class="ph-btn primary full" disabled={!title.trim() || busy}>✅ {t('chores.add')}</button>
	</form>
</AddSheet>

<style>
	.task {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		padding: 14px 14px;
		margin-bottom: 8px;
		border-radius: 14px;
		border: none;
		border-left: 6px solid var(--c);
		background: var(--card);
		color: var(--fg);
		font: 17px var(--font-body);
		box-shadow: var(--shadow);
	}
	.task.soon {
		opacity: 0.85;
	}
	.box {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		border: 3px solid var(--muted);
		flex: none;
	}
	.title {
		flex: 1;
	}
	.who {
		font-size: 14px;
		font-weight: 700;
		color: var(--muted);
	}
	.late {
		font-size: 13px;
		font-weight: 700;
		color: var(--alert);
	}
	.day {
		font-weight: 700;
		margin: 12px 0 6px;
	}
	.first {
		margin-top: 4px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.repeat {
		margin-top: 10px;
	}
	.hint {
		margin: 8px 0 0;
		font-size: 15px;
	}
	.full {
		width: 100%;
		margin-top: 16px;
	}
</style>
