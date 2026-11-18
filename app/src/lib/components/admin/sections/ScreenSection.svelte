<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, noReset, type ActionResult } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { screen } from '#lib/server/admin-sections.js';
	import type { Brightness } from '#lib/logic/schedule.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof screen>; form: ActionResult } = $props();

	const s = $derived(data.screen.schedule);
	// Weekend bez osobnego zapisu: pola startują od godzin tygodniowych.
	const we = $derived(data.screen.weekend ?? { eveningFrom: s.eveningFrom, nightFrom: s.nightFrom, nightTo: s.nightTo });
	let weekendOn = $derived(!!data.screen.weekend);
	let b = $derived<Brightness>({ ...data.screen.brightness });

	const levels: { key: keyof Brightness; label: () => string; min: number }[] = [
		{ key: 'day', label: () => t('p3a.screen.b.day'), min: 10 },
		{ key: 'evening', label: () => t('p3a.screen.b.evening'), min: 5 },
		{ key: 'night', label: () => t('p3a.screen.b.night'), min: 0 },
		{ key: 'wake', label: () => t('p3a.screen.b.wake'), min: 5 }
	];
</script>

<section id="ekran" class="adm-sec">
	<h2>{t('p3a.screen.title')}</h2>
	<p class="muted">{t('p3a.screen.intro')}</p>
	{#if msg(form, 'screen')?.error}<p class="err">{msg(form, 'screen')?.error}</p>{/if}
	{#if msg(form, 'screen')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	<form method="POST" action="?/saveScreen" use:enhance={noReset} class="grid screen">
		<fieldset>
			<legend>{t('p3a.screen.weekdays')}</legend>
			<p class="hint full">{t('p3a.screen.weekdaysHint')}</p>
			<label>{t('admin.settings.evening')} <input type="time" name="eveningFrom" value={s.eveningFrom} required /></label>
			<label>{t('admin.settings.night')} <input type="time" name="nightFrom" value={s.nightFrom} required /></label>
			<label>{t('admin.settings.wake')} <input type="time" name="nightTo" value={s.nightTo} required /></label>
		</fieldset>
		<fieldset>
			<legend>{t('p3a.screen.weekend')}</legend>
			<p class="hint full">{t('p3a.screen.weekendHint')}</p>
			<label class="check full"><input type="checkbox" name="weekendOn" bind:checked={weekendOn} data-testid="weekend-on" /> {t('p3a.screen.weekendOn')}</label>
			<label>{t('admin.settings.evening')} <input type="time" name="we_eveningFrom" value={we.eveningFrom} disabled={!weekendOn} /></label>
			<label>{t('admin.settings.night')} <input type="time" name="we_nightFrom" value={we.nightFrom} disabled={!weekendOn} /></label>
			<label>{t('admin.settings.wake')} <input type="time" name="we_nightTo" value={we.nightTo} disabled={!weekendOn} /></label>
		</fieldset>
		<fieldset class="wide levels">
			<legend>{t('p3a.screen.brightness')}</legend>
			{#each levels as l (l.key)}
				<label class="level">
					<span>{l.label()}</span>
					<input type="range" name="b_{l.key}" min={l.min} max="100" step="5" bind:value={b[l.key]} />
					<output>{b[l.key] === 0 ? t('p3a.screen.off') : `${b[l.key]} %`}</output>
				</label>
			{/each}
			<p class="hint full">{t('p3a.screen.brightnessHint')}</p>
		</fieldset>
		<div class="actions"><button class="primary">{t('common.save')}</button></div>
	</form>
</section>

<style>
	.full {
		flex-basis: 100%;
		margin: 0;
	}
	.levels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 14px 24px;
	}
	.level {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 12px;
		align-items: center;
	}
	.level span {
		grid-column: 1 / -1;
	}
	.level input {
		width: 100%;
		accent-color: var(--fg);
	}
	.level output {
		min-width: 6ch;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.levels .full {
		grid-column: 1 / -1;
	}
	input:disabled {
		opacity: 0.45;
	}
</style>
