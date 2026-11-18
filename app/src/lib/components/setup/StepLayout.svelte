<script lang="ts">
	import { untrack } from 'svelte';
	import LayoutThumb from '#lib/components/LayoutThumb.svelte';
	import { LAYOUT_PRESETS, presetDesc, presetName, type LayoutPresetId } from '#lib/layout.js';
	import { t } from '#lib/i18n/index.js';
	import type { SetupData } from '#lib/server/setup.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	let preset = $state<LayoutPresetId>(untrack(() => data.layout));

	$effect(() => {
		payload = { preset };
		ready = true;
	});
</script>

<div class="layouts">
	{#each LAYOUT_PRESETS as p (p.id)}
		<button type="button" class="card choice lay" class:selected={preset === p.id} aria-pressed={preset === p.id} onclick={() => (preset = p.id)} data-testid="layout-{p.id}">
			<span class="pic"><LayoutThumb preset={p.id} height={130} /></span>
			<b>{presetName(p.id)}</b>
			<span class="desc">{presetDesc(p.id)}</span>
		</button>
	{/each}
</div>
<p class="hint">{t('setup.layout.hint')}</p>

<style>
	.layouts {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
	}
	.lay {
		gap: 10px;
		align-content: start;
	}
	.pic {
		display: grid;
		place-items: center;
		height: 140px;
	}
	b {
		font: 600 var(--s-title) var(--font-head);
	}
	.desc {
		font-size: var(--s-small);
		color: var(--muted);
		line-height: 1.35;
	}
	@media (max-width: 1300px) {
		.layouts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.layouts {
			grid-template-columns: 1fr 1fr;
		}
		.pic {
			height: 100px;
		}
	}
</style>
