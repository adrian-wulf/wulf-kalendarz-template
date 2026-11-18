<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { t } from '#lib/i18n/index.js';

	/** Pełnoekranowy arkusz kroków kreatora: tytuł, kroki, zawsze widoczne Anuluj. */
	let {
		title,
		steps = [],
		step = 0,
		onclose,
		closeLabel = `✕ ${t('common.cancel')}`,
		children,
		footer
	}: { title: string; steps?: string[]; step?: number; onclose: () => void; closeLabel?: string; children: Snippet; footer?: Snippet } = $props();
</script>

<div class="backdrop" transition:fade={{ duration: 150 }}>
	<div class="sheet" transition:fly={{ y: 40, duration: 200 }}>
		<header>
			<h2>{title}</h2>
			{#if steps.length > 1}
				<ol class="steps">
					{#each steps as s, i (s)}
						<li class:now={i === step} class:past={i < step}>{s}</li>
					{/each}
				</ol>
			{/if}
			<button type="button" class="cancel" onclick={onclose}>{closeLabel}</button>
		</header>
		<div class="body">{@render children()}</div>
		{#if footer}<footer>{@render footer()}</footer>{/if}
	</div>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		background: rgba(30, 22, 15, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
	}
	.sheet {
		/* 1800×1000 na płótnie 1920×1080; na węższej warstwie okien (pionowy, mały ekran) mniej */
		width: min(1800px, calc(100% - 120px));
		height: min(1000px, calc(100% - 80px));
		background: var(--bg);
		border-radius: 24px;
		padding: 32px 40px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3);
	}
	header {
		display: flex;
		align-items: center;
		gap: 32px;
	}
	h2 {
		margin: 0;
		font-family: var(--font-head);
		font-size: 48px;
		font-weight: 800;
	}
	.steps {
		display: flex;
		gap: 12px;
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 22px;
		color: var(--muted);
	}
	.steps li {
		padding: 6px 16px;
		border-radius: 999px;
		border: 2px solid var(--line);
	}
	.steps li.now {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.steps li.past {
		color: var(--fg);
	}
	.cancel {
		margin-left: auto;
		font: 700 26px var(--font-body);
		padding: 18px 30px;
		border-radius: 16px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	footer:empty {
		display: none;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: 18px;
	}
	:global(.btn) {
		font: 700 30px var(--font-body);
		padding: 22px 44px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	:global(.btn.primary) {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	:global(.btn:disabled) {
		opacity: 0.35;
	}
	:global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
	}
	:global(.chip) {
		font: 600 28px var(--font-body);
		padding: 16px 26px;
		border-radius: 16px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	:global(.chip.on) {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	:global(.field) {
		font: 600 44px/1.3 var(--font-body);
		background: var(--card);
		border: 3px solid var(--fg);
		border-radius: 18px;
		padding: 18px 26px;
		min-height: 60px;
	}
	:global(.field .caret) {
		display: inline-block;
		width: 3px;
		height: 48px;
		background: var(--fg);
		vertical-align: -8px;
		animation: blink 1s steps(1) infinite;
	}
	:global(.field .ph) {
		color: var(--muted);
		font-weight: 400;
	}
	:global(.label) {
		font: 700 22px var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
