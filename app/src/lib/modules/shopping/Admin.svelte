<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t } from '#lib/i18n/index.js';
	import DemoLock from '#lib/components/admin/DemoLock.svelte';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
</script>

<section id="bring" class="adm-sec">
	<h2>{t('shopping.bringTitle')}</h2>
	<DemoLock>
	{#if msg(form, 'bring')?.error}<p class="err">{msg(form, 'bring')?.error}</p>{/if}
	{#if data.bring.error}<p class="err">{data.bring.error}</p>{/if}
	<ol class="steps">
		<li class:done={!!data.bring.email}>
			<b>{t('shopping.account')}</b> {t('shopping.accountNote')}
			{#if data.bring.email}
				<div>
					{t('shopping.loggedAs')} <b>{data.bring.email}</b>
					<form method="POST" action="?/disconnectBring" use:enhance class="inline"><button class="danger">{t('admin.google.disconnect')}</button></form>
				</div>
			{:else}
				<form method="POST" action="?/connectBring" use:enhance class="row new">
					<label class="grow">{t('shopping.email')} <input name="email" type="email" autocomplete="off" placeholder="rodzina+bring@example.com" required /></label>
					<label class="grow">{t('shopping.password')} <input name="password" type="password" autocomplete="new-password" required /></label>
					<button class="primary">{t('shopping.connect')}</button>
				</form>
			{/if}
		</li>
		<li class:done={!!data.bring.config}>
			<b>{t('shopping.list')}</b>
			{#if data.bring.lists.length}
				<form method="POST" action="?/chooseBringList" use:enhance class="row new">
					<label class="grow"
						>{t('shopping.listLabel')}
						<select name="listUuid">
							{#each data.bring.lists as l (l.listUuid)}<option value={l.listUuid} selected={data.bring.config?.listUuid === l.listUuid}>{l.name}</option>{/each}
						</select>
					</label>
					<button class="primary">{t('shopping.choose')}</button>
				</form>
				<p class="hint">{t('shopping.listHint')}</p>
			{:else if data.bring.email}
				<p class="muted">{t('shopping.noLists')}</p>
			{/if}
		</li>
	</ol>
	</DemoLock>
</section>

{#if !data.bring.config}
<section id="zakupy" class="adm-sec">
	<h2>{t('shopping.localTitle')}</h2>
	<div class="chips">
		{#each data.shopping as s (s.id)}
			<form method="POST" action="?/deleteShopping" use:enhance class="chip">
				<input type="hidden" name="id" value={s.id} />
				<span>{s.icon ?? '•'} {s.name}</span><button class="x" title={t('common.delete')}>✕</button>
			</form>
		{:else}
			<p class="muted">{t('kiosk.shoppingEmpty')}.</p>
		{/each}
	</div>
</section>
{/if}
