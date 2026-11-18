<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { settings } from '#lib/server/admin-sections.js';
	import { LANGUAGES } from '#lib/setup.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof settings> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
</script>

<section id="ustawienia" class="adm-sec">
	<h2>{t('admin.section.settings')}</h2>
	{#if msg(form, 'language')?.error}<p class="err">{msg(form, 'language')?.error}</p>{/if}
	<form method="POST" action="?/saveLanguage" use:enhance class="row new lang">
		<label>
			{t('common.language')}
			<select name="language" value={data.language} data-testid="language">
				{#each LANGUAGES as l (l.code)}<option value={l.code} lang={l.code}>{l.name}</option>{/each}
			</select>
		</label>
		<button class="primary">{t('admin.settings.saveLanguage')}</button>
		<p class="hint grow">{t('admin.settings.languageHint')}</p>
	</form>
	{#if msg(form, 'settings')?.error}<p class="err">{msg(form, 'settings')?.error}</p>{/if}
	{#if msg(form, 'settings')?.ok}<p class="ok">{t('admin.settings.saved')}</p>{/if}
	<form method="POST" action="?/saveSettings" use:enhance class="grid">
		<fieldset hidden={!data.weather}>
			<legend>{t('admin.settings.weather')}</legend>
			<label>{t('admin.settings.lat')} <input name="lat" value={data.settings.location.lat} inputmode="decimal" /></label>
			<label>{t('admin.settings.lon')} <input name="lon" value={data.settings.location.lon} inputmode="decimal" /></label>
		</fieldset>
		<!-- --- 26b: guides --- adres kalendarza śmieci przeniesiony do sekcji Śmieci -->
		{#if data.waste}<p class="hint wide">{t('guide.waste.movedHint')} <a href="/admin/smieci#z-gminy">{t('module.waste')} ›</a></p>{/if}
		<div class="actions"><button class="primary">{t('admin.settings.save')}</button></div>
	</form>
</section>
