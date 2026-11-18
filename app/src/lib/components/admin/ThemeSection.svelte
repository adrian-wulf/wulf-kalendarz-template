<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CONTRAST_PAIRS, EDITABLE, FONTS, PRESETS, contrastProblems, presetById, resolveTheme, type EditableKey, type FontId, type ThemeSettings, type Tokens } from '#lib/theme.js';

	import { dayHeader } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	let { theme, status }: { theme: ThemeSettings; status: { ok?: boolean; error?: string } | null } = $props();

	type Colors = Record<EditableKey, string>;
	const pick = (t: Tokens): Colors => Object.fromEntries(EDITABLE.map(([k]) => [k, t[k]])) as Colors;

	const init = () => {
		const r = resolveTheme(theme);
		return { preset: r.preset, font: r.font, day: pick(r.day), evening: pick(r.evening), eveningAuto: theme.evening === 'auto' };
	};
	// Stan formularza – od razu z danych serwera (SSR musi wyrenderować prawdziwe kolory).
	let f = $state(init());
	// Po zapisie (nowe dane z serwera) formularz pokazuje to, co faktycznie zapisano.
	let seen = untrack(() => theme);
	$effect.pre(() => {
		if (theme !== seen) {
			seen = theme;
			f = init();
		}
	});

	function choose(id: string) {
		const p = presetById(id)!;
		f = { preset: id, font: p.font, day: pick(p.day), evening: pick(p.evening), eveningAuto: true };
	}

	const base = $derived(presetById(f.preset) ?? PRESETS[0]);
	const edited = (t: Tokens, c: Colors) => Object.fromEntries(EDITABLE.map(([k]) => [k, c[k]]).filter(([k, v]) => v !== t[k as EditableKey]));
	const liveDay = $derived<Tokens>({ ...base.day, ...f.day });
	const liveEvening = $derived<Tokens>(
		f.eveningAuto ? resolveTheme({ preset: f.preset, font: f.font, overrides: edited(base.day, f.day), evening: 'auto' }).evening : { ...base.evening, ...f.evening }
	);
	const warn = (t: Tokens, changed: Set<string>) =>
		contrastProblems(t, CONTRAST_PAIRS.filter(([a, b]) => changed.has(a) || changed.has(b))).length > 0;
	const dayWarn = $derived(warn(liveDay, new Set(Object.keys(edited(base.day, f.day)))));
	const eveWarn = $derived(!f.eveningAuto && warn(liveEvening, new Set(Object.keys(edited(base.evening, f.evening)))));

	const vars = (t: Tokens) => `--t-bg:${t.bg};--t-card:${t.card};--t-fg:${t.fg};--t-muted:${t.muted};--t-accent:${t.accent};--t-line:${t.line};--t-ev:${t['event-bg']}`;

	const reloadPreview = () => document.querySelector<HTMLIFrameElement>('#podglad iframe')?.contentWindow?.location.reload();
</script>

{#snippet mini(tk: Tokens, f: FontId)}
	<span class="mini" style={vars(tk)} style:--t-head={FONTS[f].head}>
		<span class="mini-card"><b>{dayHeader('2026-11-13').wd} 13</b><span class="mini-ev">{t('admin.theme.sampleEvent')}</span></span>
	</span>
{/snippet}

<section id="wyglad">
	<h2>{t('admin.section.theme')}</h2>
	{#if status?.error}<p class="err">{status.error}</p>{/if}
	{#if status?.ok}<p class="ok">{t('layout.saved')}</p>{/if}

	<form
		method="POST"
		action="?/saveTheme"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') reloadPreview();
			}}
	>
		<div class="presets" role="radiogroup" aria-label={t('setup.step.theme')}>
			{#each PRESETS as p (p.id)}
				<label class="preset" class:on={f.preset === p.id}>
					<input type="radio" name="preset" value={p.id} checked={f.preset === p.id} onchange={() => choose(p.id)} />
					<span class="pair">{@render mini(p.day, p.font)}{@render mini(p.evening, p.font)}</span>
					<b>{p.name}</b>
					<small>{p.desc}</small>
				</label>
			{/each}
		</div>

		<div class="cols">
			<fieldset>
				<legend>{t('admin.theme.dayColors')}</legend>
				{#each EDITABLE as [k, label] (k)}
					<label class="color">{t(label)} <input type="color" name={`day-${k}`} bind:value={f.day[k]} /></label>
				{/each}
				{#if dayWarn}<p class="warn">{t('admin.theme.lowContrast')}</p>{/if}
			</fieldset>

			<fieldset>
				<legend>{t('admin.theme.evening')}</legend>
				<label class="check"><input type="checkbox" name="eveningAuto" bind:checked={f.eveningAuto} /> {t('admin.theme.fromTheme')}</label>
				{#if !f.eveningAuto}
					{#each EDITABLE as [k, label] (k)}
						<label class="color">{t(label)} <input type="color" name={`evening-${k}`} bind:value={f.evening[k]} /></label>
					{/each}
				{/if}
				{#if eveWarn}<p class="warn">{t('admin.theme.lowContrast')}</p>{/if}
			</fieldset>

			<fieldset>
				<legend>{t('admin.theme.font')}</legend>
				{#each Object.entries(FONTS) as [id, ff] (id)}
					<label class="font" style:--ff={ff.head}>
						<input type="radio" name="font" value={id} bind:group={f.font} />
						<span class="aa">Aa</span>{ff.label}
					</label>
				{/each}
			</fieldset>

			<div class="sample" aria-label={t('admin.theme.sample')}>
				{#each [[t('admin.theme.day'), liveDay], [t('admin.theme.evening'), liveEvening]] as const as [name, tk] (name)}
					<div class="sample-box" style={vars(tk)} style:--t-head={FONTS[f.font].head} style:--t-body={FONTS[f.font].body}>
						<span class="sample-h">{name}</span>
						<span class="sample-card"><span class="bar"></span>{t('admin.theme.sampleCard')} <small>16:30</small></span>
					</div>
				{/each}
			</div>
		</div>

		<div class="actions">
			<button class="primary">{t('admin.theme.save')}</button>
			<button formaction="?/resetTheme" formnovalidate>{t('admin.theme.reset')}</button>
		</div>
	</form>
</section>

<style>
	section {
		scroll-margin-top: 70px;
		min-width: 0;
	}
	h2 {
		font-family: var(--font-head);
		font-size: 28px;
		margin: 0 0 14px;
	}
	form {
		display: grid;
		gap: 14px;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
		gap: 10px;
	}
	.preset {
		display: grid;
		gap: 6px;
		padding: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		cursor: pointer;
		color: var(--fg);
	}
	.preset.on {
		outline: 3px solid var(--fg);
		outline-offset: -1px;
	}
	.preset input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.preset:has(input:focus-visible) {
		outline: 3px dashed var(--fg);
	}
	.preset small {
		color: var(--muted);
		font-size: 13px;
		line-height: 1.35;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-radius: 6px;
		overflow: hidden;
		border: 1px solid var(--line);
	}
	.mini {
		display: block;
		background: var(--t-bg);
		padding: 8px;
	}
	.mini-card {
		display: grid;
		gap: 4px;
		background: var(--t-card);
		color: var(--t-fg);
		border-radius: 5px;
		padding: 6px 7px;
		font-size: 12px;
	}
	.mini-card b {
		font-family: var(--t-head);
		font-size: 15px;
	}
	.mini-ev {
		background: var(--t-ev);
		border-left: 3px solid var(--t-accent);
		border-radius: 3px;
		padding: 2px 5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 14px;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--card);
		display: flex;
		flex-wrap: wrap;
		align-content: start;
		gap: 10px 14px;
		padding: 12px 14px;
		margin: 0;
	}
	legend {
		font-weight: 700;
		padding: 0 6px;
	}
	label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.color {
		display: grid;
		gap: 4px;
	}
	input[type='color'] {
		width: 56px;
		height: 38px;
		padding: 2px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg);
	}
	.check,
	.font {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-basis: 100%;
		color: var(--fg);
		font-size: 15px;
	}
	.aa {
		font-family: var(--ff);
		font-size: 22px;
		width: 34px;
	}
	.warn {
		flex-basis: 100%;
		margin: 0;
		color: var(--alert);
		font-weight: 700;
		font-size: 14px;
	}
	.sample {
		display: grid;
		gap: 8px;
	}
	.sample-box {
		display: grid;
		gap: 6px;
		background: var(--t-bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 10px 12px;
	}
	.sample-h {
		font-family: var(--t-head);
		color: var(--t-fg);
		font-size: 20px;
		font-weight: 600;
	}
	.sample-card {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--t-card);
		color: var(--t-fg);
		font: 600 17px var(--t-body);
		border-radius: 8px;
		padding: 8px 10px;
		box-shadow: 0 0 0 1px var(--t-line);
	}
	.sample-card small {
		color: var(--t-muted);
		margin-left: auto;
		font-size: 15px;
	}
	.bar {
		width: 5px;
		align-self: stretch;
		border-radius: 3px;
		background: var(--t-accent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	button {
		font: 600 15px var(--font-body);
		padding: 9px 14px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--event-bg);
		color: var(--fg);
		cursor: pointer;
	}
	.primary {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.err {
		color: var(--alert);
		font-weight: 700;
	}
	.ok {
		color: color-mix(in srgb, #1f8a4c 70%, var(--fg));
		font-weight: 700;
	}
</style>
