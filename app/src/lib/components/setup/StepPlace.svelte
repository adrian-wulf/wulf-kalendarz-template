<script lang="ts">
	import { untrack } from 'svelte';
	import TextField from './TextField.svelte';
	import type { Place } from '#lib/setup.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { locale, t } from '#lib/i18n/index.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	const { region, place } = untrack(() => data);
	const country = region?.country ?? null;
	let query = $state(place?.name ?? '');
	let results = $state<Place[]>([]);
	let picked = $state<Place | null>(place ? { name: place.name ?? '', lat: place.lat, lon: place.lon } : null);
	let busy = $state(false);
	let searched = $state(false);
	let problem = $state<string | null>(null);
	// Bez internetu: współrzędne wpisane ręcznie.
	let manual = $state(false);
	let lat = $state(place ? String(place.lat) : '');
	let lon = $state(place ? String(place.lon) : '');
	let manualName = $state(place?.name ?? '');

	async function search() {
		const q = query.trim();
		if (q.length < 2) return;
		busy = true;
		problem = null;
		try {
			const res = await fetch(`/setup/miejsca?q=${encodeURIComponent(q)}${country ? `&country=${country}` : ''}`);
			const body = (await res.json()) as { places: Place[]; error?: string };
			results = body.places;
			problem = body.error ?? null;
		} catch {
			results = [];
			problem = t('setup.place.offline');
		} finally {
			busy = false;
			searched = true;
		}
	}

	const fmt = (n: number) => n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	$effect(() => {
		if (manual) {
			payload = { name: manualName, lat, lon };
			ready = lat.trim() !== '' && lon.trim() !== '';
		} else {
			payload = picked ? { ...picked } : {};
			ready = !!picked;
		}
	});
</script>

{#if !manual}
	<div class="search">
		<TextField bind:value={query} label={t('setup.place.label')} placeholder={t('setup.place.placeholder')} max={60} testid="place-query" onenter={search} enterLabel={t('setup.place.search')} />
		<button type="button" class="btn" onclick={search} disabled={busy || query.trim().length < 2} data-testid="place-search">{busy ? t('setup.place.searching') : t('setup.place.search')}</button>
	</div>

	{#if problem}<p class="warn">{problem}</p>{/if}

	{#if results.length}
		<div class="results">
			{#each results as r (`${r.lat},${r.lon}`)}
				{@const on = picked?.lat === r.lat && picked?.lon === r.lon}
				<button type="button" class="card choice result" class:selected={on} aria-pressed={on} onclick={() => (picked = r)}>
					<b>{r.name}</b>
					<span class="muted">{r.detail}</span>
				</button>
			{/each}
		</div>
	{:else if searched && !problem}
		<p class="hint">{t('setup.place.nothing')}</p>
	{/if}

	{#if picked}
		<p class="picked" data-testid="place-picked">
			{t('setup.place.picked')} <b>{picked.name || t('setup.place.ownCoords')}</b> <span class="muted">({fmt(picked.lat)}, {fmt(picked.lon)})</span>
		</p>
	{/if}
	<button type="button" class="link" onclick={() => (manual = true)} data-testid="place-manual">{t('setup.place.manual')}</button>
{:else}
	<div class="manual">
		<TextField bind:value={manualName} label={t('setup.place.nameOptional')} placeholder={t('setup.place.namePlaceholder')} max={60} />
		<TextField bind:value={lat} label={t('setup.place.lat')} placeholder={t('setup.place.latPlaceholder')} max={12} testid="place-lat" />
		<TextField bind:value={lon} label={t('setup.place.lon')} placeholder={t('setup.place.lonPlaceholder')} max={12} testid="place-lon" />
	</div>
	<p class="hint">{t('setup.place.coordsHint')}</p>
	<button type="button" class="link" onclick={() => (manual = false)}>{t('setup.place.backToSearch')}</button>
{/if}

<style>
	.search {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 16px;
		align-items: end;
		max-width: 900px;
	}
	.results {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.result {
		gap: 4px;
	}
	.result b {
		font: 600 var(--s-title) var(--font-head);
	}
	.picked {
		font-size: var(--s-body);
		margin: 0;
	}
	.manual {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr;
		gap: 16px;
		max-width: 1100px;
	}
	@media (max-width: 700px) {
		.search,
		.manual,
		.results {
			grid-template-columns: 1fr;
		}
	}
</style>
