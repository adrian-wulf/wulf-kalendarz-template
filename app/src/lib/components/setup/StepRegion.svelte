<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { guessRegion } from '#lib/setup.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { t } from '#lib/i18n/index.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	// Zapisany region (ponowne uruchomienie) albo zgadnięty ze strefy czasowej przeglądarki.
	const saved = untrack(() => data.region);
	const start = saved ?? guessRegion(undefined);
	let country = $state<string>(start.country);
	let subdivision = $state(start.subdivision);
	let timezone = $state(start.timezone);

	onMount(() => {
		if (saved) return;
		const g = guessRegion(Intl.DateTimeFormat().resolvedOptions().timeZone);
		country = g.country;
		subdivision = g.subdivision;
		timezone = g.timezone;
	});

	const subs = $derived(data.subdivisions[country as keyof typeof data.subdivisions] ?? []);
	const zones = $derived(data.timezones.includes(timezone) ? data.timezones : [timezone, ...data.timezones]);

	function pickCountry(c: string) {
		if (c === country) return;
		country = c;
		subdivision = '';
		timezone = data.countries.find((x) => x.code === c)?.timezone ?? timezone;
	}

	$effect(() => {
		payload = { country, subdivision, timezone };
		ready = !!subdivision;
	});
</script>

<div class="block">
	<h2>{t('setup.region.country')}</h2>
	<div class="cards two">
		{#each data.countries as c (c.code)}
			<button type="button" class="card choice row" class:selected={country === c.code} aria-pressed={country === c.code} onclick={() => pickCountry(c.code)} data-testid="country-{c.code}">
				<span class="code">{c.code}</span><b>{c.name}</b>
			</button>
		{/each}
	</div>
</div>

<div class="block">
	<h2>{country === 'PL' ? t('setup.region.voivodeship') : t('setup.region.land')}</h2>
	<div class="chips grid4">
		{#each subs as s (s.code)}
			<button type="button" class="chip" class:selected={subdivision === s.code} aria-pressed={subdivision === s.code} onclick={() => (subdivision = s.code)}>{s.name}</button>
		{/each}
	</div>
</div>

<div class="block">
	<label class="select">
		<span>{t('setup.region.timezone')}</span>
		<select bind:value={timezone} data-testid="timezone">
			{#each zones as z (z)}<option value={z}>{z}</option>{/each}
		</select>
	</label>
</div>

<style>
	.code {
		font: 600 var(--s-small) var(--font-body);
		letter-spacing: 0.08em;
		color: var(--muted);
		min-width: 2.4em;
	}
	b {
		font: 600 var(--s-title) var(--font-head);
	}
	div.chips.grid4 {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	@media (max-width: 900px) {
		div.chips.grid4 {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
