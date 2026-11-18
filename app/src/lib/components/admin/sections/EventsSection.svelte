<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, localInput, memberColor, msg, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import MemberSelect from '../MemberSelect.svelte';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { events } from '#lib/server/admin-sections.js';
	import { t } from '#lib/i18n/index.js';
	// --- 26b: guides ---
	import EmptyState from '../EmptyState.svelte';

	let { data, form }: { data: AdminDataOf<typeof events> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
</script>

<section id="wydarzenia" class="adm-sec">
	<h2>{t('admin.events.title')}</h2>
	{#if msg(form, 'events')?.error}<p class="err">{msg(form, 'events')?.error}</p>{/if}
	<div class="rows">
		{#each data.events as e (e.id)}
			<form method="POST" action="?/saveEvent" use:enhance={keep} class="row" style:--c={memberColor(data.members, e.memberId)}>
				<input type="hidden" name="id" value={e.id} />
				<span class="swatch"></span>
				<label class="grow">{t('admin.events.title_')} <input name="title" value={e.title} required /></label>
				<MemberSelect members={data.members} selected={e.memberId} />
				<label>{t('admin.events.day')} <input type="date" name="date" value={e.allDay ? e.start : localInput(e.start).slice(0, 10)} required /></label>
				<label>{t('admin.events.time')} <input type="time" name="time" value={e.allDay ? '' : localInput(e.start).slice(11)} /></label>
				<label>{t('admin.events.minutes')} <input type="number" name="minutes" min="15" step="15" value={e.allDay ? 60 : Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000)} /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteEvent" class="danger">{t('common.delete')}</button>
			</form>
		{:else}
			{#if data.googleConnected}
				<p class="muted">{t('admin.events.empty')}</p>
			{:else}
				<EmptyState testid="events-empty" title={t('empty.events.title')} text={t('empty.events.text')} href="/admin/google?guide=google" action={t('empty.events.action')} />
			{/if}
		{/each}
		<form method="POST" action="?/saveEvent" use:enhance class="row new">
			<span class="swatch"></span>
			<label class="grow">{t('admin.events.title_')} <input name="title" required placeholder={t('add.event.title')} /></label>
			<MemberSelect members={data.members} selected={null} />
			<label>{t('admin.events.day')} <input type="date" name="date" value={data.today} required /></label>
			<label>{t('admin.events.time')} <input type="time" name="time" /></label>
			<label>{t('admin.events.minutes')} <input type="number" name="minutes" min="15" step="15" value="60" /></label>
			<button class="primary">{t('admin.add')}</button>
		</form>
	</div>
	<p class="hint">{t('admin.events.hint')}</p>
</section>
