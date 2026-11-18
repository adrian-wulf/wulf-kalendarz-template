<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, memberColor, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import MemberSelect from '#lib/components/admin/MemberSelect.svelte';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t, tn } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
	const c = $derived(data.countdown);
	const daysOf = (id: number) => c.upcoming.find((u) => u.id === id);
</script>

<section id="odliczanie" class="adm-sec">
	<h2>⏳ {t('module.countdown')}</h2>
	{#if msg(form, 'countdown')?.error}<p class="err">{msg(form, 'countdown')?.error}</p>{/if}
	<div class="rows">
		{#each c.list as row (row.id)}
			{@const u = daysOf(row.id)}
			<form method="POST" action="?/saveCountdown" use:enhance={keep} class="row" style:--c={memberColor(data.members, row.memberId)}>
				<input type="hidden" name="id" value={row.id} />
				<label>{t('p3b.icon')} <input name="emoji" value={row.emoji} size="3" /></label>
				<label class="grow">{t('countdown.what')} <input name="title" value={row.title} required maxlength="60" /></label>
				<label>{t('countdown.date')} <input type="date" name="date" value={row.date} required /></label>
				<label class="check"><input type="checkbox" name="yearly" checked={row.yearly} /> {t('countdown.yearly')}</label>
				<MemberSelect members={data.members} selected={row.memberId} />
				<span class="status">{u ? (u.days === 0 ? t('countdown.today') : tn('countdown.inDays', u.days)) : t('countdown.past')}</span>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteCountdown" class="danger">{t('common.delete')}</button>
			</form>
		{/each}
		<form method="POST" action="?/saveCountdown" use:enhance class="row new">
			<label>{t('p3b.icon')} <input name="emoji" value="🎉" size="3" /></label>
			<label class="grow">{t('countdown.what')} <input name="title" required maxlength="60" placeholder={t('countdown.placeholder')} /></label>
			<label>{t('countdown.date')} <input type="date" name="date" value={data.today} required /></label>
			<label class="check"><input type="checkbox" name="yearly" /> {t('countdown.yearly')}</label>
			<MemberSelect members={data.members} selected={null} />
			<button class="primary">{t('countdown.add')}</button>
		</form>
	</div>
</section>
