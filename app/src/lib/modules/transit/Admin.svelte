<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago, msg, type ActionResult } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks>; form: ActionResult } = $props();
	const tr = $derived(data.transit);
	const stopHere = $derived(tr.stop && tr.stop.provider === tr.provider ? tr.stop : null);
	const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
</script>

<section id="odjazdy" class="adm-sec">
	<h2>{t('module.transit')}</h2>
	<p class="hint">{t('transit.admin.intro')}</p>
	{#if tr.wrongCountry}
		<p class="err" data-testid="transit-wrong-country">⚠ {t('transit.admin.wrongCountry', { provider: tr.wrongCountry.provider, country: t(`region.${tr.wrongCountry.country}`) })}</p>
	{/if}

	<h3>{t('transit.admin.stop')}</h3>
	{#if msg(form, 'transitStop')?.error}<p class="err">{msg(form, 'transitStop')?.error}</p>{/if}
	{#if stopHere}
		<div class="row item">
			<b>🚏 {stopHere.name}</b>
			<span class="muted">{stopHere.id}</span>
			<span class="grow"></span>
			<span class="status">{tr.tile.fetchedAt ? `${t('transit.admin.fetched')} ${ago(tr.tile.fetchedAt)}` : ''}</span>
			<form method="POST" action="?/refreshTransit" use:enhance><button>{t('transit.admin.refresh')}</button></form>
			<form method="POST" action="?/clearStop" use:enhance><button class="danger">{t('common.delete')}</button></form>
		</div>
		{#if tr.tile.error}<p class="err">{tr.tile.error}</p>{/if}
		{#if tr.tile.departures.length}
			<table class="deps">
				<tbody>
					{#each tr.tile.departures as d (d.id)}
						<tr><td><b>{d.line}</b></td><td>{d.direction}</td><td>{d.time}</td><td>{d.cancelled ? t('transit.cancelled') : d.delay ? `+${d.delay} min` : ''}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{:else}
		<p class="muted">{t('transit.admin.noStop')}</p>
	{/if}

	<form method="GET" class="row new search">
		<label class="grow">{t('transit.admin.search')} <input name="q" value={tr.q} minlength="2" required placeholder={tr.provider === 'gtfs' ? 'Rondo ONZ' : 'Alexanderplatz'} /></label>
		<button class="primary">{t('transit.admin.find')}</button>
	</form>
	{#if tr.searchError}<p class="err">{tr.searchError}</p>{/if}
	{#if tr.q && !tr.searchError}
		<div class="rows hits">
			{#each tr.hits as h (h.id)}
				<form method="POST" action="?/pickStop" use:enhance class="row item">
					<input type="hidden" name="id" value={h.id} />
					<input type="hidden" name="name" value={h.name} />
					<b>{h.name}</b>
					<span class="muted">{h.detail ?? ''}</span>
					<span class="grow"></span>
					<button>{t('transit.admin.pick')}</button>
				</form>
			{:else}
				<p class="muted">{t('transit.admin.noHits')}</p>
			{/each}
		</div>
	{/if}

	{#if tr.provider === 'gtfs'}
		<h3>GTFS</h3>
		{#if msg(form, 'gtfs')?.error}<p class="err">{msg(form, 'gtfs')?.error}</p>{/if}
		<p class="muted">{tr.gtfs ? t('transit.admin.gtfsFile', { size: mb(tr.gtfs.size), date: ago(tr.gtfs.mtime) }) : t('transit.admin.gtfsNone')}</p>
		<form method="POST" action="?/uploadGtfs" enctype="multipart/form-data" use:enhance class="row new">
			<label class="grow">{t('transit.admin.gtfsUpload')} <input type="file" name="file" accept=".zip,application/zip" required /></label>
			<button class="primary">{t('transit.admin.upload')}</button>
		</form>
		<p class="hint">{t('transit.admin.gtfsHint')}</p>
	{/if}
</section>

<style>
	.deps {
		margin: 6px 0 12px;
	}
	.search {
		margin-top: 12px;
	}
	.hits {
		margin-top: 8px;
	}
</style>
