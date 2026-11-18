<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import AddSheet from '#lib/components/phone/AddSheet.svelte';
	import { api, deferred, say } from '#lib/phone/toast.svelte.js';
	import { dayHeader, fmtDayMonth } from '#lib/format.js';
	import { t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const EMOJI = ['🎉', '🏖️', '🎄', '🎂', '✈️', '⛷️', '🎃', '🐣', '🎓', '🏕️'];
	const hidden = new SvelteSet<string>();
	let adding = $state(false);
	let title = $state('');
	let emoji = $state('🎉');
	let date = $state('');
	let yearly = $state(false);
	let busy = $state(false);

	const when = (days: number) => (days === 0 ? t('countdown.today') : days === 1 ? t('countdown.tomorrow') : tn('countdown.inDays', days));

	function remove(id: number | string, label: string) {
		deferred(hidden, String(id), t('countdown.deleted', { title: label }), () => api(`/api/countdown/${id}`, 'DELETE').then(() => invalidateAll()));
	}

	async function add() {
		busy = true;
		try {
			await api('/api/countdown', 'POST', { title, emoji, date: date || data.today, yearly });
			say(`✓ ${t('countdown.added', { title })}`);
			title = '';
			date = '';
			yearly = false;
			adding = false;
			await invalidateAll();
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}
</script>

{#each data.items.filter((c) => !hidden.has(String(c.id))) as c (c.id)}
	<div class="ph-card cd" class:now={c.days === 0}>
		<span class="emo">{c.emoji}</span>
		<div class="txt">
			<b>{c.title}</b>
			<span class="ph-muted">{dayHeader(c.next).wd}, {fmtDayMonth(c.next)}{c.yearly ? ' · 🔁' : ''} · {when(c.days)}</span>
		</div>
		<span class="num">{c.days}</span>
		{#if typeof c.id === 'number'}
			<button type="button" class="x" aria-label="{t('common.delete')}: {c.title}" onclick={() => remove(c.id, c.title)}>✕</button>
		{/if}
	</div>
{:else}
	<p class="ph-muted">{t('countdown.empty')}</p>
{/each}

<AddSheet title={t('countdown.add')} bind:open={adding}>
	<form onsubmit={(e) => (e.preventDefault(), add())}>
		<input class="ph-input" bind:value={title} maxlength="60" placeholder={t('countdown.placeholder')} />
		<div class="chips emojis">
			{#each EMOJI as e (e)}
				<button type="button" class="chip" class:on={emoji === e} onclick={() => (emoji = e)}>{e}</button>
			{/each}
		</div>
		<div class="ph-label">{t('countdown.date')}</div>
		<input class="ph-input" type="date" value={date || data.today} min={data.today} oninput={(e) => (date = e.currentTarget.value)} />
		<label class="yearly"><input type="checkbox" bind:checked={yearly} /> 🔁 {t('countdown.yearly')}</label>
		<button class="ph-btn primary full" disabled={!title.trim() || busy}>✓ {t('countdown.add')}</button>
	</form>
</AddSheet>

<style>
	.cd {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.cd.now {
		box-shadow: inset 0 0 0 2px var(--fg);
	}
	.emo {
		font-size: 32px;
	}
	.txt {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.txt span {
		font-size: 14px;
	}
	.num {
		font: 800 30px var(--font-head);
		font-variant-numeric: tabular-nums;
	}
	.x {
		border: none;
		background: none;
		color: var(--muted);
		font-size: 18px;
		padding: 8px;
	}
	.emojis {
		margin-top: 10px;
	}
	.yearly {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
	}
	.yearly input {
		width: 20px;
		height: 20px;
	}
	.full {
		width: 100%;
		margin-top: 16px;
	}
</style>
