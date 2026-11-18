<script lang="ts">
	import { untrack } from 'svelte';
	import TextField from './TextField.svelte';
	import { nextColor, type DraftMember } from '#lib/setup.js';
	import type { SetupData } from '#lib/server/setup.js';
	import { t } from '#lib/i18n/index.js';

	let { data, payload = $bindable(), ready = $bindable() }: { data: SetupData; payload: Record<string, unknown>; ready: boolean } = $props();

	const MAX = 12;
	// Kolor w kreatorze wybiera się z palety bez kolorów pojemników; stary kolor spoza niej zostaje do wyboru.
	const fresh = (list: DraftMember[]): DraftMember => ({ name: '', color: nextColor(list.map((m) => m.color), data.bins) });
	const start = untrack(() => data.members);
	let list = $state<DraftMember[]>(start.length ? start.map((m) => ({ ...m })) : [fresh([])]);
	let picking = $state<number | null>(null);

	function add() {
		if (list.length >= MAX) return;
		list.push(fresh(list));
		picking = null;
	}
	function remove(i: number) {
		list.splice(i, 1);
		picking = null;
	}
	const paletteFor = (m: DraftMember) => (data.palette.includes(m.color) ? data.palette : [m.color, ...data.palette]);

	$effect(() => {
		payload = { members: list.map((m) => ({ ...m, name: m.name.trim() })) };
		ready = list.length > 0 && list.every((m) => m.name.trim());
	});
</script>

<div class="people">
	{#each list as m, i (m)}
		<div class="person" style:--c={m.color} data-testid="member-row">
			<button type="button" class="dot" aria-label={t('setup.members.colorOf', { name: m.name || t('setup.members.newPerson') })} aria-expanded={picking === i} onclick={() => (picking = picking === i ? null : i)}></button>
			<div class="name">
				<TextField bind:value={m.name} label={t('setup.members.name')} placeholder={t('setup.members.placeholder')} max={30} testid="member-name" />
			</div>
			<button type="button" class="btn ghost" onclick={() => remove(i)} disabled={list.length === 1} data-testid="member-remove">{t('common.delete')}</button>
			{#if picking === i}
				<div class="palette" role="radiogroup" aria-label={t('setup.members.color')}>
					{#each paletteFor(m) as c (c)}
						{@const taken = list.some((o, j) => j !== i && o.color === c)}
						<button
							type="button"
							class="swatch"
							class:on={m.color === c}
							class:taken
							style:--s={c}
							role="radio"
							aria-checked={m.color === c}
							aria-label="{c}{taken ? ` (${t('setup.members.taken')})` : ''}"
							onclick={() => ((m.color = c), (picking = null))}
						></button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<button type="button" class="btn add" onclick={add} disabled={list.length >= MAX} data-testid="member-add">{t('setup.members.add')}</button>
<p class="hint">{t('setup.members.hint')}</p>

<style>
	.people {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
	.person {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 16px;
		align-items: end;
		background: var(--card);
		border: 1px solid var(--line);
		border-left: 8px solid var(--c);
		border-radius: var(--radius);
		padding: 14px 16px;
	}
	.dot {
		width: var(--h-control);
		height: var(--h-control);
		border-radius: 50%;
		border: 3px solid var(--card);
		outline: 2px solid var(--line);
		background: var(--c);
		padding: 0;
	}
	.palette {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.swatch {
		width: var(--h-control);
		height: var(--h-control);
		border-radius: 50%;
		border: 3px solid var(--card);
		outline: 2px solid transparent;
		background: var(--s);
		padding: 0;
	}
	.swatch.on {
		outline-color: var(--fg);
	}
	.swatch.taken:not(.on) {
		opacity: 0.45;
	}
	.add {
		justify-self: start;
	}
	@media (max-width: 900px) {
		.people {
			grid-template-columns: 1fr;
		}
	}
</style>
