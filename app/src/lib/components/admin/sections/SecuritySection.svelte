<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, noReset, type ActionResult } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { security } from '#lib/server/security-section.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof security>; form: ActionResult } = $props();
	const s = $derived(data.security);
	const modeName = $derived(s.mode === 'proxy' ? t('sec.mode.proxy') : s.mode === 'password' ? t('sec.mode.password') : t('sec.mode.tailscale'));
	const modeDesc = $derived(s.mode === 'proxy' ? t('sec.mode.proxyDesc', { header: s.proxyHeader, proxies: s.trustedProxies.join(', ') }) : s.mode === 'password' ? t('sec.mode.passwordDesc') : t('sec.mode.tailscaleDesc'));
</script>

<section id="dostep" class="adm-sec">
	<h2>{t('sec.admin.title')}</h2>
	<p class="muted">{t('sec.admin.intro')}</p>

	<div class="grid">
		<fieldset class="wide">
			<legend>{t('sec.admin.mode')}</legend>
			<p class="full" data-testid="auth-mode"><b>{modeName}</b> – {modeDesc}</p>
			<p class="hint full">{s.kioskLocal ? t('sec.admin.kioskLocal') : t('sec.admin.kioskOff')}</p>
			<p class="hint full">{s.apiToken ? t('sec.admin.tokenOn') : t('sec.admin.tokenOff')}</p>
		</fieldset>
	</div>

	{#if msg(form, 'pin')?.error}<p class="err">{msg(form, 'pin')?.error}</p>{/if}
	{#if msg(form, 'pin')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	<form method="POST" action="?/savePin" use:enhance class="grid">
		<fieldset>
			<legend>{t('sec.admin.pin')}</legend>
			<p class="hint full" data-testid="pin-status">{s.pin ? t('sec.admin.pinSet') : t('sec.admin.pinNone')}</p>
			<label>{s.pin ? t('sec.admin.newPin') : t('sec.admin.pinLabel')} <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern={'\\d{4,8}'} required data-testid="pin" /></label>
			<label>{t('sec.admin.repeatPin')} <input name="repeat" type="password" inputmode="numeric" autocomplete="off" pattern={'\\d{4,8}'} required data-testid="pin-repeat" /></label>
			<p class="hint full">{t('sec.admin.pinHint')}</p>
		</fieldset>
		<div class="actions">
			<button class="primary">{s.pin ? t('sec.admin.changePin') : t('sec.admin.setPin')}</button>
		</div>
	</form>
	{#if s.pin}
		<form method="POST" action="?/removePin" use:enhance class="row">
			<button class="danger" data-testid="remove-pin">{t('sec.admin.removePin')}</button>
		</form>
	{/if}

	{#if msg(form, 'pinOnDelete')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	<form method="POST" action="?/savePinOnDelete" use:enhance={noReset} class="grid">
		<fieldset>
			<legend>{t('sec.admin.onDelete')}</legend>
			<label class="check full"><input type="checkbox" name="pinOnDelete" checked={s.pinOnDelete} disabled={!s.pin} data-testid="pin-on-delete" /> {t('sec.admin.onDeleteLabel')}</label>
			<p class="hint full">{s.pin ? t('sec.admin.onDeleteHint') : t('sec.admin.onDeleteNeedsPin')}</p>
		</fieldset>
		<div class="actions"><button class="primary" disabled={!s.pin}>{t('admin.settings.save')}</button></div>
	</form>

	{#if s.mode === 'password'}
		{#if msg(form, 'password')?.error}<p class="err">{msg(form, 'password')?.error}</p>{/if}
		{#if msg(form, 'password')?.ok}<p class="ok">✓ {t('sec.admin.passwordSaved')}</p>{/if}
		{#if s.password.fromEnv}
			<p class="hint">{t('sec.admin.passwordEnv')}</p>
		{:else}
			<form method="POST" action="?/changePassword" use:enhance class="grid">
				<fieldset>
					<legend>{t('sec.admin.password')}</legend>
					{#if s.password.set}
						<label class="full">{t('sec.admin.currentPassword')} <input name="current" type="password" autocomplete="current-password" required /></label>
					{/if}
					<label>{t('sec.newPassword')} <input name="password" type="password" autocomplete="new-password" minlength="10" required /></label>
					<label>{t('sec.repeatPassword')} <input name="repeat" type="password" autocomplete="new-password" minlength="10" required /></label>
					<p class="hint full">{t('sec.admin.passwordHint')}</p>
				</fieldset>
				<div class="actions"><button class="primary">{t('sec.admin.savePassword')}</button></div>
			</form>
		{/if}
	{/if}
</section>
