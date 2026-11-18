<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Keyboard from '../kiosk/Keyboard.svelte';
	import { t } from '#lib/i18n/index.js';

	/**
	 * Pole tekstowe kreatora. Na ekranie dotykowym kiosku (szeroki ekran, dotyk) dotknięcie otwiera
	 * klawiaturę ekranową; na telefonie i komputerze to zwykłe pole z klawiaturą systemu.
	 */
	let {
		value = $bindable(''),
		label,
		placeholder = '',
		max = 30,
		testid,
		onenter,
		enterLabel = t('common.done')
	}: { value?: string; label: string; placeholder?: string; max?: number; testid?: string; onenter?: () => void; enterLabel?: string } = $props();

	let onScreen = $state(false);
	let open = $state(false);

	onMount(() => {
		const mq = matchMedia('(min-width: 1200px) and (any-pointer: coarse)');
		onScreen = mq.matches;
		const on = () => (onScreen = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	function done() {
		open = false;
		onenter?.();
	}
</script>

<label class="field">
	<span class="label">{label}</span>
	<input
		bind:value
		{placeholder}
		maxlength={max}
		autocomplete="off"
		inputmode={onScreen ? 'none' : 'text'}
		data-testid={testid}
		onpointerdown={() => onScreen && (open = true)}
		onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onenter?.())}
	/>
</label>

{#if open}
	<div class="kb-panel" transition:fly={{ y: 120, duration: 180 }} data-testid="keyboard">
		<div class="preview">
			<span class="label">{label}</span>
			<span class="text">{value}<span class="caret"></span></span>
			<button type="button" class="close" onclick={() => (open = false)}>{t('setup.keyboardHide')}</button>
		</div>
		<Keyboard bind:value {max} onenter={done} {enterLabel} />
	</div>
{/if}

<style>
	.field {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.label {
		font-size: var(--s-small);
		font-weight: 600;
		color: var(--muted);
	}
	input {
		font: 500 var(--s-input) var(--font-body);
		height: var(--h-control);
		padding: 0 16px;
		border: 2px solid var(--line);
		border-radius: var(--radius-s);
		background: var(--card);
		color: var(--fg);
		min-width: 0;
		width: 100%;
		-webkit-user-select: text;
		user-select: text;
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.kb-panel {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 20px 20px 24px;
		background: var(--bg);
		border-top: 1px solid var(--line);
		box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.18);
	}
	.preview {
		display: flex;
		align-items: center;
		gap: 20px;
		width: min(1180px, 100%);
	}
	.preview .text {
		flex: 1;
		font: 600 40px var(--font-body);
		min-height: 56px;
		border-bottom: 2px solid var(--accent);
		white-space: nowrap;
		overflow: hidden;
	}
	.caret {
		display: inline-block;
		width: 3px;
		height: 40px;
		margin-left: 2px;
		vertical-align: -6px;
		background: var(--accent);
		animation: blink 1s steps(1) infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	.close {
		font: 600 22px var(--font-body);
		height: 60px;
		padding: 0 24px;
		border-radius: var(--radius-s);
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
</style>
