<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks>; form: ActionResult } = $props();
	const ha = $derived(data.ha);
	const chosen = $derived(new Map(ha.selected.map((s) => [s.entityId, s.label])));
	// Wybrane encje, których HA teraz nie zwrócił (np. niedostępny) – zostają na liście.
	const missing = $derived(ha.selected.filter((s) => !ha.entities.some((e) => e.entityId === s.entityId)));
	let filter = $state('');
	const shown = $derived(
		ha.entities.filter((e) => !filter || chosen.has(e.entityId) || `${e.entityId} ${e.name}`.toLowerCase().includes(filter.toLowerCase()))
	);
</script>

<section id="home-assistant" class="adm-sec">
	<h2>Home Assistant</h2>
	<p class="hint">{t('ha.admin.intro')}</p>

	<h3>{t('ha.admin.connection')}</h3>
	{#if msg(form, 'haAuth')?.error}<p class="err">{msg(form, 'haAuth')?.error}</p>{/if}
	<form method="POST" action="?/saveHaAuth" use:enhance={keep} class="row">
		<label class="grow">{t('ha.admin.url')} <input name="url" type="url" value={ha.url ?? ''} required placeholder="http://192.168.1.20:8123" /></label>
		<label class="grow"
			>{t('ha.admin.token')}
			<input name="token" type="password" autocomplete="off" required={!ha.tokenHint} placeholder={ha.tokenHint ? t('ha.admin.tokenKept', { hint: ha.tokenHint }) : t('ha.admin.tokenPlaceholder')} />
		</label>
		<button class="primary">{t('common.save')}</button>
		{#if ha.tokenHint}<button formaction="?/disconnectHa" class="danger" formnovalidate>{t('ha.admin.disconnect')}</button>{/if}
	</form>
	<p class="hint">🔒 {t('ha.admin.tokenHint')}</p>

	{#if ha.url}
		<h3>{t('ha.admin.entities')}</h3>
		{#if ha.error}<p class="err">{ha.error}</p>{/if}
		{#if msg(form, 'haEntities')?.error}<p class="err">{msg(form, 'haEntities')?.error}</p>{/if}
		<input class="filter" type="search" placeholder={t('ha.admin.filter')} bind:value={filter} />
		<form method="POST" action="?/saveHaEntities" use:enhance={keep} class="ents">
			<table>
				<tbody>
					{#each [...missing.map((s) => ({ entityId: s.entityId, name: s.label || s.entityId, state: '?' })), ...shown] as e (e.entityId)}
						<tr>
							<td><label class="check"><input type="checkbox" name="entity" value={e.entityId} checked={chosen.has(e.entityId)} /> <code>{e.entityId}</code></label></td>
							<td>{e.name}</td>
							<td class="muted">{e.state}</td>
							<td><input name="label:{e.entityId}" value={chosen.get(e.entityId) ?? ''} maxlength="40" placeholder={t('ha.admin.label')} /></td>
						</tr>
					{:else}
						<tr><td class="muted" colspan="4">{t('ha.admin.noEntities')}</td></tr>
					{/each}
				</tbody>
			</table>
			<button class="primary">{t('ha.admin.saveEntities')}</button>
		</form>
		<p class="hint">{t('ha.admin.entitiesHint')}</p>
	{/if}
</section>

<style>
	.filter {
		margin: 4px 0 8px;
		width: min(100%, 360px);
	}
	.ents {
		display: grid;
		gap: 10px;
		justify-items: start;
	}
	.ents table {
		width: 100%;
	}
	.ents td input:not([type='checkbox']) {
		width: 100%;
	}
</style>
