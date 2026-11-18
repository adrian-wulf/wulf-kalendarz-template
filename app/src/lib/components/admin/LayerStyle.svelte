<script lang="ts">
	import { t } from '#lib/i18n/index.js';

	/**
	 * Kolor i ikona kalendarza: gotowe kolory jednym kliknięciem (plus własny), „Automatycznie” = kolor osoby
	 * jak dotąd; ikony jako emoji do wyboru (plus „bez ikony”). Pola formularza: `color` i `icon`.
	 */
	let {
		color,
		icon,
		palette,
		icons,
		allowAuto = true,
		autoSwatch = null
	}: { color: string | null; icon: string; palette: string[]; icons: string[]; allowAuto?: boolean; autoSwatch?: string | null } = $props();

	// svelte-ignore state_referenced_locally
	let selected = $state(color ?? (allowAuto ? 'auto' : palette[0]));
	// svelte-ignore state_referenced_locally
	let custom = $state(color && !palette.includes(color) ? color : '#336699');
	// svelte-ignore state_referenced_locally
	let chosenIcon = $state(icon);
	const iconList = $derived(icon && !icons.includes(icon) ? [icon, ...icons] : icons);
	const uid = $props.id();
</script>

<fieldset class="lstyle">
	<legend>{t('cal.field.color')}</legend>
	<div class="swatches" role="radiogroup" aria-label={t('cal.field.color')}>
		{#if allowAuto}
			<label class="sw auto" title={t('cal.color.autoHint')}>
				<input type="radio" name="color" value="auto" bind:group={selected} />
				<span class="dot" style:--c={autoSwatch ?? 'var(--accent)'}></span>{t('cal.color.auto')}
			</label>
		{/if}
		{#each palette as c (c)}
			<label class="sw" title={c}><input type="radio" name="color" value={c} bind:group={selected} aria-label={c} /><span class="dot" style:--c={c}></span></label>
		{/each}
		<label class="sw other" title={t('cal.color.other')}>
			<input type="radio" name="color" value={custom} bind:group={selected} aria-label={t('cal.color.other')} />
			<input type="color" bind:value={custom} oninput={() => (selected = custom)} aria-label={t('cal.color.other')} id="{uid}-c" />
		</label>
	</div>
</fieldset>
<fieldset class="lstyle">
	<legend>{t('cal.field.icon')}</legend>
	<div class="swatches" role="radiogroup" aria-label={t('cal.field.icon')}>
		<label class="sw ic none"><input type="radio" name="icon" value="" bind:group={chosenIcon} />{t('cal.icon.none')}</label>
		{#each iconList as i (i)}
			<label class="sw ic"><input type="radio" name="icon" value={i} bind:group={chosenIcon} />{i}</label>
		{/each}
	</div>
</fieldset>

<style>
	.lstyle {
		flex: 1 1 100%;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.sw {
		display: inline-flex !important;
		flex-direction: row !important;
		align-items: center;
		gap: 6px !important;
		padding: 4px;
		border: 2px solid transparent;
		border-radius: 999px;
		cursor: pointer;
		color: var(--fg) !important;
		font-size: 14px !important;
	}
	.sw:has(input:checked) {
		border-color: var(--fg);
	}
	.sw input[type='radio'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.sw:has(input:focus-visible) {
		outline: 2px solid var(--accent);
	}
	.dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--c);
		display: inline-block;
	}
	.auto {
		padding-right: 12px;
	}
	.other input[type='color'] {
		width: 34px !important;
		height: 30px !important;
		padding: 0 !important;
		border-radius: 50% !important;
		border: 0 !important;
		background: none !important;
	}
	.ic {
		min-width: 38px;
		justify-content: center;
		font-size: 20px !important;
		background: var(--bg);
	}
	.ic.none {
		font-size: 13px !important;
		padding: 6px 10px;
	}
</style>
