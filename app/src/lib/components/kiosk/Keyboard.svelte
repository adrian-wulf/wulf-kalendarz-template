<script lang="ts">
	/** Klawiatura ekranowa (Cage nie ma systemowej); układy jako dane w lib/keyboard.ts. */
	import { getLang, t } from '#lib/i18n/index.js';
	import { KEYBOARD_LAYOUTS, nextLayout, upperKey } from '#lib/keyboard.js';

	let {
		value = $bindable(''),
		max = 120,
		onenter,
		enterLabel = `${t('common.next')} →`,
		enterDisabled = false,
		onback
	}: { value?: string; max?: number; onenter?: () => void; enterLabel?: string; enterDisabled?: boolean; onback?: () => void } = $props();

	import { keyboardLayout } from './layout.svelte.js';

	let shift = $state(true); // pierwsza litera wielka

	const layout = $derived(KEYBOARD_LAYOUTS[keyboardLayout.current ?? getLang()]);
	const ROWS = $derived([...layout.rows, layout.extra]);

	function press(k: string) {
		if (k === '⇧') return (shift = !shift);
		if (k === '⌫') {
			value = value.slice(0, -1);
			if (!value) shift = true;
			return;
		}
		if (value.length >= max) return;
		value += shift ? upperKey(k) : k;
		shift = false;
	}
</script>

<div class="kb">
	{#each ROWS as row, i (i)}
		<div class="row" class:empty={!row.length}>
			{#each row as k (k)}
				<button
					type="button"
					class="key"
					class:wide={k === '⇧' || k === '⌫'}
					class:on={k === '⇧' && shift}
					class:pl={i === 4}
					onpointerdown={(e) => {
						e.preventDefault();
						press(k);
					}}>{shift ? upperKey(k) : k}</button
				>
			{/each}
		</div>
	{/each}
	<div class="row">
		{#if onback}
			<button type="button" class="key action" onpointerdown={(e) => (e.preventDefault(), onback())}>← {t('common.back')}</button>
		{/if}
		<button
			type="button"
			class="key lang"
			onpointerdown={(e) => {
				e.preventDefault();
				keyboardLayout.current = nextLayout(layout.id);
			}}>🌐 {layout.label}</button
		>
		{#each [',', '.', '-', ':'] as k (k)}
			<button type="button" class="key" onpointerdown={(e) => (e.preventDefault(), press(k))}>{k}</button>
		{/each}
		<button type="button" class="key space" onpointerdown={(e) => (e.preventDefault(), press(' '))}>{t('keyboard.space')}</button>
		{#each ['?', '!'] as k (k)}
			<button type="button" class="key" onpointerdown={(e) => (e.preventDefault(), press(k))}>{k}</button>
		{/each}
		{#if onenter}
			<button type="button" class="key enter" disabled={enterDisabled} onpointerdown={(e) => (e.preventDefault(), !enterDisabled && onenter())}
				>{enterLabel}</button
			>
		{/if}
	</div>
</div>

<style>
	.kb {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
		background: var(--event-bg);
		border-radius: var(--radius);
		padding: 16px;
	}
	.row {
		display: flex;
		gap: 8px;
		max-width: 100%;
	}
	.key {
		min-width: 92px;
		height: 70px;
		border: none;
		border-radius: 12px;
		background: var(--card);
		color: var(--fg);
		font: 600 32px var(--font-body);
		box-shadow: 0 3px 0 var(--line);
	}
	.key:active {
		transform: translateY(2px);
		box-shadow: none;
		background: var(--line);
	}
	.key.pl {
		background: color-mix(in srgb, var(--card) 85%, #e0457b);
	}
	.row.empty {
		height: 70px;
	}
	/* Dolny rząd ściska się w węższym oknie (ekran pionowy); na 1920×1080 bez zmian. */
	.lang {
		width: 130px;
		min-width: 100px;
		font-size: 26px;
		background: color-mix(in srgb, var(--card) 80%, #2f80ed);
	}
	.wide {
		min-width: 150px;
	}
	.on {
		background: var(--fg);
		color: var(--card);
	}
	.space {
		width: 320px;
		min-width: 120px;
		font-size: 24px;
		color: var(--muted);
	}
	.action {
		width: 200px;
		min-width: 150px;
		white-space: nowrap;
		font-size: 26px;
	}
	.enter:disabled {
		opacity: 0.35;
	}
	.enter {
		width: 220px;
		min-width: 150px;
		white-space: nowrap;
		background: var(--fg);
		color: var(--card);
		font-size: 28px;
	}
</style>
