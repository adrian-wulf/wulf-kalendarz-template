<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, noReset, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { region } from '#lib/server/admin-sections.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof region> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	// Region: lista landów/województw i strefa zależą od wybranego kraju (zapis dopiero przyciskiem).
	let country = $derived<string>(data.region.country);
	let subdivision = $derived(data.region.subdivision);
	let timezone = $derived(data.region.timezone);
	const subdivisionsOf = (c: string) => data.subdivisions[c as keyof typeof data.subdivisions] ?? [];
	const timezones = $derived(data.timezones.includes(timezone) ? data.timezones : [timezone, ...data.timezones]);
	function pickCountry(c: string) {
		country = c;
		subdivision = subdivisionsOf(c)[0]?.code ?? '';
		timezone = data.countries.find((x) => x.code === c)?.timezone ?? timezone;
	}
</script>

<section id="region" class="adm-sec">
	<h2>{t('setup.step.region')}</h2>
	{#if msg(form, 'region')?.error}<p class="err">{msg(form, 'region')?.error}</p>{/if}
	{#if msg(form, 'region')?.ok}<p class="ok">{t('admin.region.saved')}</p>{/if}
	<form method="POST" action="?/saveRegion" use:enhance={noReset} class="row new region">
		<label>
			{t('setup.region.country')}
			<select name="country" value={country} onchange={(e) => pickCountry(e.currentTarget.value)}>
				{#each data.countries as c (c.code)}<option value={c.code}>{c.name}</option>{/each}
			</select>
		</label>
		<label>
			{country === 'PL' ? t('setup.region.voivodeship') : t('setup.region.land')}
			<select name="subdivision" value={subdivision} onchange={(e) => (subdivision = e.currentTarget.value)}>
				{#each subdivisionsOf(country) as s (s.code)}<option value={s.code}>{s.name}</option>{/each}
			</select>
		</label>
		<label>
			{t('setup.region.timezone')}
			<select name="timezone" value={timezone} onchange={(e) => (timezone = e.currentTarget.value)}>
				{#each timezones as z (z)}<option value={z}>{z}</option>{/each}
			</select>
		</label>
		<button class="primary">{t('admin.region.save')}</button>
	</form>
	<p class="hint">{t('admin.region.hint')}</p>
</section>
