<script lang="ts">
	import { untrack } from 'svelte';
	import type { DemoChoice } from '#lib/setup.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { t } from '#lib/i18n/index.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	let demo = $state<DemoChoice | null>(untrack(() => data.demo));

	const OPTIONS: { id: DemoChoice; title: string; text: string }[] = [
		{ id: 'empty', title: t('setup.data.empty'), text: t('setup.data.emptyText') },
		{ id: 'example', title: t('setup.data.example'), text: t('setup.data.exampleText') }
	];

	$effect(() => {
		payload = { demo };
		ready = !!demo;
	});
</script>

<div class="cards two">
	{#each OPTIONS as o (o.id)}
		<button type="button" class="card choice big" class:selected={demo === o.id} aria-pressed={demo === o.id} onclick={() => (demo = o.id)} data-testid="demo-{o.id}">
			<b>{o.title}</b>
			<span class="desc">{o.text}</span>
		</button>
	{/each}
</div>
<p class="hint">{t('setup.data.hint')}</p>

<style>
	.big {
		min-height: 170px;
		align-content: start;
		gap: 12px;
	}
	b {
		font: 600 var(--s-h2) var(--font-head);
	}
	.desc {
		font-size: var(--s-body);
		line-height: 1.4;
		color: var(--muted);
	}
</style>
