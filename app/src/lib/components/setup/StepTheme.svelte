<script lang="ts">
	import { untrack } from 'svelte';
	import { PRESETS } from '#lib/theme.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { t } from '#lib/i18n/index.js';

	let {
		data,
		payload = $bindable(),
		ready = $bindable(),
		preview = $bindable()
	}: { data: SetupData; payload: Record<string, unknown>; ready: boolean; preview: string | null } = $props();

	let preset = $state(untrack(() => data.theme));

	$effect(() => {
		payload = { preset };
		ready = true;
		preview = preset;
	});
</script>

<div class="themes">
	{#each PRESETS as p (p.id)}
		<button type="button" class="card choice theme" class:selected={preset === p.id} aria-pressed={preset === p.id} onclick={() => (preset = p.id)} data-testid="theme-{p.id}">
			<span class="mini" style:--b={p.day.bg} style:--k={p.day.card} style:--f={p.day.fg} style:--a={p.day.accent} style:--l={p.day.line} style:--n={p.evening.bg}>
				<span class="mcard"><i class="w60"></i><i class="w40 acc"></i><i class="w80"></i></span>
				<span class="mcard"><i class="w40"></i><i class="w80"></i></span>
				<span class="night"></span>
			</span>
			<b>{p.name}</b>
			<span class="desc">{p.desc}</span>
		</button>
	{/each}
</div>
<p class="hint">{t('setup.theme.hint')}</p>

<style>
	.themes {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
	}
	.theme {
		gap: 8px;
		align-content: start;
	}
	b {
		font: 600 var(--s-title) var(--font-head);
	}
	.desc {
		font-size: var(--s-small);
		color: var(--muted);
		line-height: 1.35;
	}
	.mini {
		position: relative;
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 8px;
		padding: 12px;
		height: 120px;
		border-radius: var(--radius-s);
		background: var(--b);
		border: 1px solid var(--l);
		overflow: hidden;
	}
	.mcard {
		display: grid;
		align-content: start;
		gap: 8px;
		background: var(--k);
		border-radius: 6px;
		padding: 10px;
	}
	.mcard i {
		display: block;
		height: 8px;
		border-radius: 4px;
		background: var(--f);
		opacity: 0.8;
	}
	.mcard i.acc {
		background: var(--a);
		opacity: 1;
	}
	.w40 {
		width: 40%;
	}
	.w60 {
		width: 60%;
	}
	.w80 {
		width: 80%;
	}
	.night {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 34px;
		height: 34px;
		background: var(--n);
		clip-path: polygon(100% 0, 100% 100%, 0 100%);
	}
	@media (max-width: 1300px) {
		.themes {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.themes {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.mini {
			height: 90px;
		}
	}
</style>
