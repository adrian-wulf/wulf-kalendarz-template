<script lang="ts">
	import Sheet from './Sheet.svelte';
	import type { Dashboard, RemoveKind } from '#lib/types.js';
	import { t } from '#lib/i18n/index.js';

	/** Pełna, przewijana lista zakupów / kartek / zadań z kafelka – z odhaczaniem i dodawaniem. */
	let {
		kind,
		data,
		hidden,
		onclose,
		onadd,
		onremove
	}: {
		kind: 'shopping' | 'note' | 'chore';
		data: Dashboard;
		hidden: Set<string>;
		onclose: () => void;
		onadd: () => void;
		onremove: (kind: RemoveKind, id: string, label: string) => void;
	} = $props();

	const TITLE = { shopping: () => `🛒 ${t('kiosk.shopping')}`, note: () => `📌 ${t('kiosk.notes')}`, chore: () => `✅ ${t('kiosk.chores')}` };
	const ADD = { shopping: () => t('list.addProduct'), note: () => t('list.addNote'), chore: () => t('list.addChore') };

	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const colorOf = (id: string | null) => (id ? memberById.get(id)?.color : undefined) ?? 'var(--accent)';
	const shopping = $derived(data.modules.shopping?.filter((i) => !hidden.has(`shopping:${i.id}`)) ?? null);
	const notes = $derived((data.modules.notes ?? []).filter((n) => !hidden.has(`note:${n.id}`)));
	const tasks = $derived(data.tasks.filter((x) => !hidden.has(`task:${x.key}`)));
	const count = $derived(kind === 'shopping' ? (shopping?.length ?? 0) : kind === 'note' ? notes.length : tasks.length);
</script>

<Sheet title="{TITLE[kind]()} · {count}" {onclose} closeLabel="✕ {t('common.close')}">
	<div class="scroll">
		{#if kind === 'shopping'}
			{#if shopping === null}
				<p class="muted">{t('kiosk.shoppingUnavailable')}</p>
			{:else}
				<ul class="shop">
					{#each shopping as item (item.id)}
						<li>
							<span class="icon">{item.icon ?? '•'}</span>
							<span class="txt">{item.name}{#if item.spec}<small>{item.spec}</small>{/if}</span>
							<button type="button" class="tick" onclick={() => onremove('shopping', item.id, item.name)}>✓ {t('list.bought')}</button>
						</li>
					{:else}
						<p class="muted">{t('kiosk.shoppingEmpty')} ✨</p>
					{/each}
				</ul>
			{/if}
		{:else if kind === 'note'}
			<div class="notes">
				{#each notes as n (n.id)}
					<div class="note" style:--c={colorOf(n.memberId)}>
						<div class="txt">
							<span class="author">{n.memberId ? memberById.get(n.memberId)?.name : t('common.family')}</span>
							{n.text}
						</div>
						<button type="button" class="tick" onclick={() => onremove('note', n.id, n.text)}>{t('list.takeDown')}</button>
					</div>
				{:else}
					<p class="muted">{t('kiosk.notesEmpty')}</p>
				{/each}
			</div>
		{:else}
			<ul class="tasks">
				{#each tasks as task (task.key)}
					<li style:--c={task.bin ? task.binColor : colorOf(task.memberId)} class:bin={!!task.bin}>
						<span class="txt">
							{task.bin ? '🗑 ' : ''}{task.title}
							{#if task.overdue}<em>{t('list.overdue')}</em>{/if}
							{#if task.memberId}<span class="who">{memberById.get(task.memberId)?.name}</span>{/if}
						</span>
						<button type="button" class="tick" onclick={() => onremove('task', task.key, task.title)}>✓ {t('list.done')}</button>
					</li>
				{:else}
					<p class="muted">{t('kiosk.choresDone')} 🎉</p>
				{/each}
			</ul>
		{/if}
	</div>

	{#snippet footer()}
		<button type="button" class="btn primary" onclick={onadd}>{ADD[kind]()}</button>
	{/snippet}
</Sheet>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		touch-action: pan-y;
		padding-right: 12px;
	}
	.scroll::-webkit-scrollbar {
		width: 14px;
	}
	.scroll::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 7px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.muted {
		color: var(--muted);
		font-size: 32px;
		margin: 0;
	}
	.shop {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 24px;
	}
	li,
	.note {
		display: flex;
		align-items: center;
		gap: 16px;
		background: var(--card);
		border-radius: 16px;
		padding: 12px 12px 12px 20px;
		font-size: 32px;
		min-width: 0;
	}
	.icon {
		font-size: 36px;
		width: 44px;
		text-align: center;
		flex: none;
	}
	.txt {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.shop .txt {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		margin-left: 10px;
		color: var(--muted);
		font-size: 24px;
	}
	.tick {
		flex: none;
		font: 700 24px var(--font-body);
		padding: 16px 22px;
		border-radius: 14px;
		border: 3px solid var(--line);
		background: var(--event-bg);
		color: var(--fg);
	}
	.notes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px 24px;
		align-items: start;
	}
	.note {
		background: var(--note);
		border-top: 8px solid var(--c);
	}
	.author {
		display: block;
		font-size: 20px;
		font-weight: 700;
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
	.tasks {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tasks li {
		border-left: 10px solid var(--c);
	}
	.tasks li.bin {
		background: color-mix(in srgb, var(--c) 16%, var(--card));
	}
	em {
		margin-left: 12px;
		font-style: normal;
		font-size: 22px;
		font-weight: 600;
		color: var(--alert);
	}
	.who {
		margin-left: 12px;
		font-size: 22px;
		font-weight: 650;
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
</style>
