<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import AddSheet from '#lib/components/phone/AddSheet.svelte';
	import { me } from '#lib/phone/me.svelte.js';
	import { api, deferred, say } from '#lib/phone/toast.svelte.js';
	import { addDays, localParts } from '#lib/logic/dates.js';
	import { fmtShortDate, fmtTime } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const DURATIONS = [
		['evening', () => t('add.note.evening')],
		['tomorrow', () => t('add.note.tomorrow')],
		['3days', () => t('add.note.3days')],
		['date', () => t('notes.untilDate')]
	] as const;

	let text = $state('');
	let duration = $state<(typeof DURATIONS)[number][0]>('evening');
	let until = $state('');
	let from = $state<string | null>(null);
	let busy = $state(false);
	let adding = $state(false);
	const author = $derived(from ?? me.id);

	const hidden = new SvelteSet<string>();
	const name = (id: string | null) => data.members.find((m) => m.id === id);

	function expiry(iso: string) {
		const { date } = localParts(new Date(iso));
		const time = fmtTime(iso);
		if (date === data.today) return t('notes.until', { time });
		if (date === addDays(data.today, 1)) return t('notes.untilTomorrow', { time });
		return t('notes.untilDay', { date: fmtShortDate(date), time });
	}

	async function add() {
		busy = true;
		try {
			await api('/api/notes', 'POST', { text, memberId: author, ...(duration === 'date' ? { until } : { duration }) });
			text = '';
			adding = false;
			await invalidateAll();
			say(`📌 ${t('notes.posted')}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}

	function remove(id: string) {
		deferred(hidden, id, t('notes.removed'), () => api(`/api/notes/${id}`, 'DELETE').then(() => invalidateAll()));
	}
</script>

{#each data.notes.filter((n) => !hidden.has(n.id)) as n (n.id)}
	<div class="note" style:--c={name(n.memberId)?.color ?? 'var(--line)'}>
		{#if name(n.memberId)}<div class="from">{name(n.memberId)?.name}</div>{/if}
		<div class="text">{n.text}</div>
		<div class="ph-row foot">
			<span class="ph-muted">{expiry(n.expiresAt)}</span>
			<button type="button" class="ph-btn small" onclick={() => remove(n.id)}>{t('list.takeDown')}</button>
		</div>
	</div>
{:else}
	<p class="ph-muted">{t('notes.empty')}</p>
{/each}

<AddSheet title={t('add.note.title')} bind:open={adding}>
	<form onsubmit={(e) => (e.preventDefault(), add())}>
		<textarea class="ph-input" bind:value={text} rows="3" maxlength="200" placeholder={t('notes.placeholder')}></textarea>
		<div class="ph-label">{t('add.note.howLong')}</div>
		<div class="chips">
			{#each DURATIONS as [id, label] (id)}
				<button type="button" class="chip" class:on={duration === id} onclick={() => ((duration = id), id === 'date' && !until && (until = addDays(data.today, 1)))}>{label()}</button>
			{/each}
		</div>
		{#if duration === 'date'}<input class="ph-input date" type="date" bind:value={until} min={data.today} />{/if}
		<div class="ph-label">{t('notes.from')}</div>
		<div class="chips">
			{#each data.members as m (m.id)}
				<button type="button" class="chip" class:on={author === m.id} style:--c={m.color} onclick={() => (from = m.id)}><span class="dot"></span>{m.name}</button>
			{/each}
		</div>
		<button class="ph-btn primary full" disabled={!text.trim() || busy}>📌 {t('notes.post')}</button>
	</form>
</AddSheet>

<style>
	textarea {
		resize: none;
	}
	.date {
		margin-top: 10px;
	}
	.full {
		width: 100%;
		margin-top: 16px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.note {
		background: var(--note);
		border-top: 5px solid var(--c);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 12px;
		box-shadow: var(--shadow);
	}
	.from {
		font-weight: 700;
		font-size: 14px;
		color: var(--c);
		filter: brightness(0.8);
	}
	.text {
		font-size: 19px;
		margin: 4px 0 8px;
		overflow-wrap: anywhere;
	}
	.foot {
		justify-content: space-between;
	}
	.small {
		padding: 8px 12px;
		font-size: 15px;
	}
</style>
