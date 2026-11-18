<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { google } from '#lib/server/admin-sections.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof google> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	/** Aktualna rola kalendarza: rola rodziny albo domownik, do którego jest przypisany. */
	function roleOf(calId: string): string {
		const r = data.google.roles;
		for (const k of ['family', 'notes', 'kita', 'birthdays'] as const) if (r[k] === calId) return k;
		const m = data.members.find((x) => x.calendarIds.includes(calId));
		return m ? `member:${m.id}` : '';
	}
</script>

<section id="google" class="adm-sec">
	<h2>Google Calendar</h2>
	{#if data.google.error}<p class="err">{data.google.error}</p>{/if}
	{#if data.google.justConnected}<p class="ok">{t('admin.google.justConnected')}</p>{/if}
	{#if msg(form, 'google')?.error}<p class="err">{msg(form, 'google')?.error}</p>{/if}
	{#if msg(form, 'google')?.ok}<p class="ok">{t('admin.saved')}.</p>{/if}

	<ol class="steps">
		<li class:done={!!data.google.clientId}>
			<b>{t('admin.google.client')}</b> {t('admin.google.clientNote')}
			<form method="POST" action="?/saveGoogleClient" use:enhance class="row new">
				<label class="grow">{t('admin.google.clientId')} <input name="clientId" value={data.google.clientId ?? ''} placeholder="….apps.googleusercontent.com" required /></label>
				<label class="grow"
					>{t('admin.google.secret')} <input name="clientSecret" type="password" autocomplete="off" placeholder={data.google.clientId ? `•••••• (${t('admin.google.keepSecret')})` : ''} /></label
				>
				<button class="primary">{t('common.save')}</button>
			</form>
			<p class="hint">{t('admin.google.redirect')} <code>{data.google.redirectUri}</code></p>
		</li>
		<li class:done={data.google.connected}>
			<b>{t('admin.google.account')}</b>
			{#if data.google.connected}
				<span class="pill good">{t('admin.google.connected')}</span>
				<form method="POST" action="?/disconnectGoogle" use:enhance class="inline"><button class="danger">{t('admin.google.disconnect')}</button></form>
			{:else}
				<p class="hint">{t('admin.google.loginHint')}</p>
			{/if}
			{#if data.google.clientId}<a class="button primary" href="/admin/google/start" data-sveltekit-reload>{data.google.connected ? t('admin.google.reconnect') : t('admin.google.connect')}</a>{/if}
		</li>
		<li class:done={!!data.google.roles.family}>
			<b>{t('admin.google.assign')}</b>
			{#if data.google.calendarsError}<p class="err">{data.google.calendarsError}</p>{/if}
			{#if data.google.calendars.length}
				<form method="POST" action="?/saveGoogleCalendars" use:enhance={keep} class="cals">
					{#each data.google.calendars as c (c.id)}
						<label class="cal">
							<span><b>{c.summary}</b> <small class="muted">{c.accessRole === 'owner' ? t('admin.google.own') : c.accessRole === 'freeBusyReader' ? t('admin.google.freeBusy') : t('admin.google.shared')}</small></span>
							<select name={`cal:${c.id}`} value={roleOf(c.id)}>
								<option value="">— {t('admin.google.hide')} —</option>
								<optgroup label={t('admin.google.familyCals')}>
									<option value="family">{t('admin.google.role.family')}</option>
									<option value="notes">{t('admin.google.role.notes')}</option>
									<option value="kita">{t('admin.google.role.kita')}</option>
									<option value="birthdays">{t('admin.google.role.birthdays')}</option>
								</optgroup>
								<optgroup label={t('admin.google.memberCal')}>
									{#each data.members as m (m.id)}<option value={`member:${m.id}`}>{m.name}</option>{/each}
								</optgroup>
							</select>
						</label>
					{/each}
					<div class="actions"><button class="primary">{t('admin.google.saveAssign')}</button></div>
				</form>
				<p class="hint">{t('admin.google.missingHint')}</p>
			{:else if data.google.connected}
				<p class="muted">{t('admin.google.noCals')}</p>
			{/if}
		</li>
	</ol>
</section>
