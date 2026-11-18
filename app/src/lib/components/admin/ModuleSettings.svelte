<script lang="ts">
	import { enhance } from '$app/forms';
	import { msg, noReset, type ActionResult } from './admin.svelte.js';
	import type { SettingsSchema } from '#lib/modules/types.js';
	import { t } from '#lib/i18n/index.js';

	/** Formularz ustawień modułu wygenerowany ze schematu z manifestu. */
	let { schema, values, form }: { schema: SettingsSchema; values: Record<string, unknown>; form: ActionResult } = $props();
</script>

<section id="ustawienia-modulu" class="adm-sec">
	<h3>{t('admin.moduleSettings')}</h3>
	{#if msg(form, 'moduleConfig')?.error}<p class="err">{msg(form, 'moduleConfig')?.error}</p>{/if}
	{#if msg(form, 'moduleConfig')?.ok}<p class="ok">{t('admin.saved')}.</p>{/if}
	<form method="POST" action="?/saveModuleConfig" use:enhance={noReset} class="row new config">
		{#each Object.entries(schema) as [key, f] (key)}
			{#if f.type === 'boolean'}
				<label class="check"><input type="checkbox" name={key} checked={!!values[key]} /> {f.label}</label>
			{:else if f.type === 'select'}
				<label
					>{f.label}
					<select name={key} value={values[key]}>{#each f.options as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>
				</label>
			{:else if f.type === 'number'}
				<label>{f.label} <input type="number" name={key} value={values[key]} min={f.min} max={f.max} step={f.step ?? 1} required /></label>
			{:else}
				<label class="grow">{f.label} <input name={key} value={values[key]} maxlength={f.maxLength} pattern={f.pattern} /></label>
			{/if}
		{/each}
		<button class="primary">{t('admin.saveModuleSettings')}</button>
	</form>
	{#each Object.values(schema).filter((f) => f.hint) as f (f.label)}<p class="hint">{f.label}: {f.hint}</p>{/each}
</section>
