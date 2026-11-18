<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { msg, type ActionResult } from '../admin.svelte.js';
	import { LAYOUT_PRESETS, RESOLUTIONS, ROTATIONS, presetDesc, presetName, presetOf, rotationCommand, sizeKey, type LayoutSettings } from '#lib/layout.js';
	import LayoutThumb from '#lib/components/LayoutThumb.svelte';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: { layout: LayoutSettings }; form: ActionResult } = $props();

	const init = () => ({ ...data.layout, resolution: sizeKey(data.layout.resolution) });
	// Stan formularza; po zapisie (nowe dane z serwera) pokazuje to, co faktycznie zapisano.
	let f = $state(init());
	let seen = untrack(() => data.layout);
	$effect.pre(() => {
		if (data.layout !== seen) {
			seen = data.layout;
			f = init();
		}
	});

	// Zapisana rozdzielczość spoza listy (np. ustawiona przez API) też jest do wyboru.
	const resolutions = $derived.by(() => {
		const own = data.layout.resolution;
		if (own === 'auto' || RESOLUTIONS.some((r) => sizeKey(r) === sizeKey(own))) return RESOLUTIONS;
		return [{ ...own, label: () => t('layout.res.custom', { w: own.w, h: own.h }) }, ...RESOLUTIONS];
	});

	// Podgląd: kiosk z niezapisanym wyborem (?layout=…), w proporcjach ekranu.
	const screen = $derived.by(() => {
		if (f.resolution !== 'auto') {
			const [w, h] = f.resolution.split('x').map(Number);
			return { w, h };
		}
		return presetOf(f.preset)!.base;
	});
	const src = $derived(`/?layout=${f.preset}&res=${f.resolution}&density=${f.density}`);
	const mismatch = $derived((screen.w >= screen.h) !== (presetOf(f.preset)!.base.w >= presetOf(f.preset)!.base.h));
</script>

<section id="uklad" class="adm-sec">
	<h2>{t('layout.title')}</h2>
	{#if msg(form, 'layout')?.error}<p class="err">{msg(form, 'layout')?.error}</p>{/if}
	{#if msg(form, 'layout')?.ok}<p class="ok">{t('layout.saved')}</p>{/if}

	<form
		method="POST"
		action="?/saveLayout"
		use:enhance={() =>
			async ({ update }) => {
				await update({ reset: false });
			}}
	>
		<div class="presets" role="radiogroup" aria-label={t('layout.title')}>
			{#each LAYOUT_PRESETS as p (p.id)}
				<label class="preset" class:on={f.preset === p.id} data-preset={p.id}>
					<input type="radio" name="preset" value={p.id} bind:group={f.preset} />
					<LayoutThumb preset={p.id} />
					<b>{presetName(p.id)}</b>
					<small>{presetDesc(p.id)}</small>
				</label>
			{/each}
		</div>

		<div class="cols">
			<fieldset>
				<legend>{t('layout.resolution')}</legend>
				<label class="field">
					{t('layout.screen')}
					<select name="resolution" bind:value={f.resolution}>
						<option value="auto">{t('layout.res.auto')}</option>
						{#each resolutions as r (sizeKey(r))}<option value={sizeKey(r)}>{r.label()}</option>{/each}
					</select>
				</label>
				<p class="note">{t('layout.resolutionNote')}</p>
				{#if mismatch}<p class="warn">{t('layout.mismatch')}</p>{/if}
			</fieldset>

			<fieldset>
				<legend>{t('layout.density')}</legend>
				<label class="check"><input type="radio" name="density" value="comfortable" bind:group={f.density} /> {t('layout.density.comfortable')}</label>
				<label class="check"><input type="radio" name="density" value="compact" bind:group={f.density} /> {t('layout.density.compact')}</label>
			</fieldset>

			<fieldset>
				<legend>{t('layout.rotation')}</legend>
				<div class="rot">
					{#each ROTATIONS as r (r)}
						<label class="check"><input type="radio" name="rotation" value={r} checked={f.rotation === r} onchange={() => (f.rotation = r)} /> {r}°</label>
					{/each}
				</div>
				<p class="note">{t('layout.rotationNote')}</p>
				<code class="cmd">{rotationCommand(f.rotation)}</code>
				<p class="note">{t('layout.outputNote')} <code>app/kiosk/README.md</code>.</p>
			</fieldset>
		</div>

		<div class="actions">
			<button class="primary">{t('layout.save')}</button>
		</div>
	</form>

	<h3>{t('layout.preview')} {f.resolution === 'auto' ? `${screen.w}×${screen.h}` : f.resolution.replace('x', '×')}</h3>
	<div class="preview live" style:aspect-ratio="{screen.w} / {screen.h}" style:width="min(100%, {Math.round((620 * screen.w) / screen.h)}px)">
		<iframe {src} title={t('layout.preview')}></iframe>
	</div>
	<p class="hint">{t('layout.previewHint')}</p>
</section>

<style>
	form {
		display: grid;
		gap: 14px;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 10px;
	}
	.preset {
		position: relative;
		display: grid;
		grid-template-rows: 120px auto 1fr;
		gap: 6px;
		padding: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		cursor: pointer;
		color: var(--fg);
		font-size: 15px;
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
		font-weight: 400;
		line-height: 1.35;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 14px;
	}
	fieldset {
		display: grid;
		align-content: start;
		gap: 8px;
		min-width: 0;
	}
	.field {
		display: grid;
		gap: 4px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--fg);
		font-size: 15px;
	}
	.rot {
		display: flex;
		gap: 16px;
	}
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.4;
	}
	.warn {
		margin: 0;
		color: var(--alert);
		font-weight: 700;
		font-size: 14px;
	}
	.cmd {
		display: block;
		overflow-wrap: anywhere;
		font-size: 13px;
	}
	h3 {
		margin: 22px 0 10px;
	}
	.preview.live {
		max-width: 100%;
	}
</style>
