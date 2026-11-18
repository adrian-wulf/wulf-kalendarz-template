<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, localInput, memberColor, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import MemberSelect from '#lib/components/admin/MemberSelect.svelte';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
</script>

<section id="kartki" class="adm-sec">
	<h2>{t('module.notes')}{data.googleNotes ? ` ${t('notes.adminGoogle')}` : ''}</h2>
	{#if msg(form, 'notes')?.error}<p class="err">{msg(form, 'notes')?.error}</p>{/if}
	<div class="rows">
		{#each data.notes as n (n.id)}
			<form method="POST" action="?/saveNote" use:enhance={keep} class="row" style:--c={memberColor(data.members, n.memberId)}>
				<input type="hidden" name="id" value={n.id} />
				<span class="swatch"></span>
				<label class="grow">{t('notes.text')} <input name="text" value={n.text} required maxlength="200" /></label>
				<MemberSelect members={data.members} selected={n.memberId} />
				<label>{t('notes.hangsUntil')} <input type="datetime-local" name="until" value={localInput(n.expiresAt)} required /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteNote" class="danger">{t('list.takeDown')}</button>
			</form>
		{/each}
		<form method="POST" action="?/saveNote" use:enhance class="row new">
			<span class="swatch"></span>
			<label class="grow">{t('notes.text')} <input name="text" required maxlength="200" placeholder={t('add.note.title')} /></label>
			<MemberSelect members={data.members} selected={null} />
			<label>{t('notes.hangsUntil')} <input type="datetime-local" name="until" value={`${data.today}T23:00`} required /></label>
			<button class="primary">{t('notes.hang')}</button>
		</form>
	</div>
</section>
