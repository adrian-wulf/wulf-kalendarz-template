<script lang="ts">
	import { untrack } from 'svelte';
	import { toggleModule } from '#lib/setup.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { t } from '#lib/i18n/index.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	let enabled = $state<Record<string, boolean>>(Object.fromEntries(untrack(() => data.modules).map((m) => [m.id, m.enabled])));
	let note = $state<string | null>(null);
	const name = (id: string) => data.modules.find((m) => m.id === id)?.name ?? id;

	function flip(id: string) {
		const before = enabled;
		const next = toggleModule(before, id, !before[id]);
		const also = Object.keys(next).filter((k) => k !== id && next[k] !== before[k]);
		const list = also.map(name).join(', ');
		note = also.length ? (next[id] ? t('setup.modules.alsoOn', { list, name: name(id) }) : t('setup.modules.alsoOff', { list, name: name(id) })) : null;
		enabled = next;
	}

	$effect(() => {
		payload = { enabled: { ...enabled } };
		ready = true;
	});
</script>

<div class="mods">
	{#each data.modules as m (m.id)}
		<button type="button" class="card mod" class:on={enabled[m.id]} role="switch" aria-checked={enabled[m.id]} onclick={() => flip(m.id)} data-testid="module-{m.id}">
			<span class="top">
				<b>{m.name}</b>
				<span class="switch" aria-hidden="true"><span></span></span>
			</span>
			<span class="desc">{m.description}</span>
			{#if m.requires.length}<span class="req">{t('setup.modules.requires', { list: m.requires.map(name).join(', ') })}</span>{/if}
		</button>
	{/each}
</div>
<p class="note" aria-live="polite">{note ?? t('setup.modules.note')}</p>

<style>
	.mods {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
	}
	.mod {
		display: grid;
		align-content: start;
		gap: 8px;
		text-align: left;
		min-height: 150px;
	}
	/* Stan pokazuje przełącznik – bez grubej ramki wyboru na każdej karcie. */
	.mod:not(.on) {
		background: transparent;
		box-shadow: none;
	}
	.mod:not(.on) .desc,
	.mod:not(.on) b {
		color: var(--muted);
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	b {
		font: 600 var(--s-title) var(--font-head);
	}
	.desc {
		font-size: var(--s-body);
		line-height: 1.35;
	}
	.req {
		font-size: var(--s-small);
		color: var(--muted);
	}
	.switch {
		flex: none;
		width: 68px;
		height: 38px;
		border-radius: 999px;
		background: var(--line);
		position: relative;
		transition: background 0.15s;
	}
	.switch span {
		position: absolute;
		top: 4px;
		left: 4px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s;
	}
	.on .switch {
		background: var(--accent);
	}
	.on .switch span {
		transform: translateX(30px);
	}
	.note {
		margin: 0;
		font-size: var(--s-body);
		color: var(--muted);
		min-height: 1.4em;
	}
	@media (max-width: 1100px) {
		.mods {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.mods {
			grid-template-columns: 1fr;
		}
		.mod {
			min-height: 0;
		}
	}
</style>
