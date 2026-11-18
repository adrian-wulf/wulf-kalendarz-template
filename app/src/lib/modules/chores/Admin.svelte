<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Recurrence } from '#lib/server/db/schema.js';
	import { memberColor, memberName, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import MemberSelect from '#lib/components/admin/MemberSelect.svelte';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { fmtShortDate, weekdaysShort } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	const WD = weekdaysShort();
	function describe(r: Recurrence): string {
		if (r.type === 'once') return t('chores.desc.once', { date: r.date });
		if (r.type === 'daily') return t('chores.daily');
		if (r.type === 'weekly') return t('chores.desc.weekly', { days: r.days.map((d) => WD[d - 1]).join(', ') });
		return t('chores.desc.monthly', { day: r.day });
	}
	let editChore = $state<number | null>(null);
	let choreType = $state<Recurrence['type']>('weekly');
</script>

<section id="zadania" class="adm-sec">
	<h2>{t('chores.adminTitle')}</h2>
	{#if msg(form, 'chores')?.error}<p class="err">{msg(form, 'chores')?.error}</p>{/if}
	<div class="rows">
		{#each data.chores as c (c.id)}
			{#if editChore === c.id}
				{@render choreForm(c.id, c.title, c.memberId, c.recurrence)}
			{:else}
				<div class="row item" style:--c={memberColor(data.members, c.memberId)}>
					<b>{c.title}</b>
					<span>{memberName(data.members, c.memberId)}</span>
					<span class="muted">{describe(c.recurrence)}</span>
					<span class="grow"></span>
					<span class="status"
						>{c.doneToday ? `✓ ${t('chores.doneToday')} · ` : ''}{c.next
							? t('chores.next', { date: c.next === data.today ? t('time.today') : fmtShortDate(c.next) })
							: t('chores.finished')}</span
					>
					<button onclick={() => ((editChore = c.id), (choreType = c.recurrence.type))}>{t('common.edit')}</button>
					<form method="POST" action="?/deleteChore" use:enhance>
						<input type="hidden" name="id" value={c.id} /><button class="danger">{t('common.delete')}</button>
					</form>
				</div>
			{/if}
		{/each}
		{#if editChore === null}{@render choreForm(null, '', null, { type: 'weekly', days: [1] })}{/if}
	</div>
</section>

{#snippet choreForm(id: number | null, title: string, memberId: string | null, r: Recurrence)}
	<form method="POST" action="?/saveChore" use:enhance={() =>
			async ({ update }) => {
				await update();
				editChore = null;
			}} class="row new chore">
		{#if id}<input type="hidden" name="id" value={id} />{/if}
		<label class="grow">{t('chores.task')} <input name="title" value={title} required maxlength="80" placeholder={t('add.chore.title')} /></label>
		<MemberSelect members={data.members} selected={memberId} />
		<label
			>{t('chores.repeat')}
			<select name="type" bind:value={choreType}>
				<option value="once">{t('chores.onceLower')}</option>
				<option value="daily">{t('chores.daily')}</option>
				<option value="weekly">{t('chores.weeklyLower')}</option>
				<option value="monthly">{t('chores.monthlyLower')}</option>
			</select>
		</label>
		{#if choreType === 'once'}
			<label>{t('admin.events.day')} <input type="date" name="date" value={r.type === 'once' ? r.date : data.today} /></label>
		{:else if choreType === 'weekly'}
			<span class="days">
				{#each WD as d, i (d)}
					<label class="day"><input type="checkbox" name="days" value={i + 1} checked={r.type === 'weekly' && r.days.includes(i + 1)} />{d}</label>
				{/each}
			</span>
		{:else if choreType === 'monthly'}
			<label>{t('chores.monthDay')} <input type="number" name="monthDay" min="1" max="31" value={r.type === 'monthly' ? r.day : 1} /></label>
		{/if}
		<button class="primary">{id ? t('common.save') : t('chores.add')}</button>
		{#if id}<button type="button" onclick={() => (editChore = null)}>{t('common.cancel')}</button>{/if}
	</form>
{/snippet}
