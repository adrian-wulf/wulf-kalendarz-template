<script lang="ts">
	import { hold } from '#lib/kiosk/hold.js';
	import type { Dashboard, RemoveKind } from '#lib/types.js';
	import type { TileKind } from '#lib/modules/types.js';
	import { t } from '#lib/i18n/index.js';
	// --- p3b: meals, kids, countdown ---
	import MealsTile from '#lib/modules/meals/KioskTile.svelte';
	import KidsTile from '#lib/modules/kids/KioskTile.svelte';
	import CountdownTile from '#lib/modules/countdown/KioskTile.svelte';
	// --- p3c: care, transit, home assistant ---
	import ModuleTile from './kiosk/ModuleTile.svelte';

	/** Kafelki aktywnych modułów w kolejności z panelu (`kinds` wylicza +page.svelte). */
	let {
		data,
		kinds,
		spans = [],
		hidden,
		onadd,
		onremove,
		onopen
	}: {
		data: Dashboard;
		kinds: TileKind[];
		/** szerokość kafelka w kolumnach siatki (kilka rzędów, patrz `rowGrid` w +page.svelte) */
		spans?: number[];
		hidden: Set<string>;
		onadd: (kind: 'shopping' | 'note' | 'chore') => void;
		onremove: (kind: RemoveKind, id: string, label: string) => void;
		onopen: (kind: TileKind) => void;
	} = $props();

	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const colorOf = (id: string | null) => (id ? memberById.get(id)?.color : undefined) ?? 'var(--accent)';
	const shopping = $derived(data.modules.shopping?.filter((i) => !hidden.has(`shopping:${i.id}`)) ?? null);
	const notes = $derived((data.modules.notes ?? []).filter((n) => !hidden.has(`note:${n.id}`)));
	const tasks = $derived(data.tasks.filter((x) => !hidden.has(`task:${x.key}`)));

	// Dotknięcie kafelka poza pozycjami (te mają własne przytrzymanie) i poza „+” – pełna lista.
	const open = (kind: TileKind) => (e: MouseEvent) => {
		// Leki, opieka, odjazdy i HA obsługują dotyk w samym kafelku (bez okna).
		if (kind === 'meds' || kind === 'care' || kind === 'transit' || kind === 'ha') return;
		if (!(e.target as HTMLElement).closest('li, .note, .add')) onopen(kind);
	};
</script>

{#each kinds as kind, i (kind)}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<section class="tile" data-tile={kind} style:grid-column={spans[i] ? `span ${spans[i]}` : undefined} onclick={open(kind)}>
		{#if kind === 'shopping'}{@render shoppingTile()}{:else if kind === 'note'}{@render noteTile()}{:else if kind === 'chore'}{@render choreTile()}{:else if kind === 'meal'}<MealsTile {data} />{:else if kind === 'kids'}<KidsTile {data} />{:else if kind === 'countdown'}<CountdownTile {data} />{:else}<ModuleTile {kind} {data} />{/if}
	</section>
{/each}

{#snippet shoppingTile()}
	<header>
		<h3>🛒 {t('kiosk.shopping')}{#if shopping?.length ?? 0} <span class="n">{shopping?.length ?? 0}</span>{/if}</h3>
		<span class="all">{t('common.all')}</span>
		<button type="button" class="add" onclick={() => onadd('shopping')}>+</button>
	</header>
	{#if shopping === null}
		<p class="muted">{t('kiosk.shoppingUnavailable')}</p>
	{:else if shopping.length === 0}
		<p class="muted">{t('kiosk.shoppingEmpty')} ✨</p>
	{:else}
		<ul class="shopping">
			{#each shopping as item (item.id)}
				<li use:hold={{ onDone: () => onremove('shopping', item.id, item.name), onTap: () => onopen('shopping') }}>
					<span class="icon">{item.icon ?? '•'}</span>
					<span>{item.name}{#if item.spec}<small>{item.spec}</small>{/if}</span>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet noteTile()}
	<header>
		<h3>📌 {t('kiosk.notes')}{#if notes.length} <span class="n">{notes.length}</span>{/if}</h3>
		<span class="all">{t('common.all')}</span>
		<button type="button" class="add" onclick={() => onadd('note')}>+</button>
	</header>
	<div class="notes">
		{#each notes as n (n.id)}
			<div class="note" style:--c={colorOf(n.memberId)} use:hold={{ onDone: () => onremove('note', n.id, n.text), onTap: () => onopen('note') }}>
				<span class="author">{n.memberId ? memberById.get(n.memberId)?.name : t('common.family')}</span>
				{n.text}
			</div>
		{:else}
			<p class="muted">{t('kiosk.notesEmpty')}</p>
		{/each}
	</div>
{/snippet}

{#snippet choreTile()}
	<header>
		<h3>✅ {t('kiosk.chores')}{#if tasks.length} <span class="n">{tasks.length}</span>{/if}</h3>
		<span class="all">{t('common.all')}</span>
		<button type="button" class="add" onclick={() => onadd('chore')}>+</button>
	</header>
	<ul class="tasks">
		{#each tasks as task (task.key)}
			<li
				style:--c={task.bin ? task.binColor : colorOf(task.memberId)}
				class:bin={!!task.bin}
				class:overdue={task.overdue}
				use:hold={{ onDone: () => onremove('task', task.key, task.title), onTap: () => onopen('chore') }}
			>
				<span class="box"></span>
				<span class="title" data-overdue={task.overdue ? t('list.overdue') : undefined}>{task.bin ? '🗑 ' : ''}{task.title}</span>
				{#if task.memberId}<span class="who">{memberById.get(task.memberId)?.name}</span>{/if}
			</li>
		{:else}
			<p class="muted">{t('kiosk.choresDone')} 🎉</p>
		{/each}
	</ul>
{/snippet}

<style>
	.tile {
		background: var(--card);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: var(--tile-pad, 14px 22px 18px);
		min-width: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		container-type: inline-size;
	}
	/* Treść niższa niż lista (mały ekran, układ miesiąca): ostatni wiersz wygasa zamiast być ucięty. */
	.tile > :global(:last-child) {
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
		/* dolny margines kafelka należy do listy – ucięcie wypada tam, gdzie dawniej */
		margin-bottom: -18px;
		padding-bottom: 18px;
		mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent);
	}
	/* …ale same pozycje nie ściskają się do wysokości kafelka. */
	.shopping {
		grid-auto-rows: max-content;
		align-content: start;
	}
	.tasks > li,
	.notes > .note {
		flex: none;
	}
	/* Wąski kafelek (ekran pionowy, mały ekran): bez „wszystkie ›”, zakupy w jednej kolumnie. */
	@container (max-width: 440px) {
		.all {
			display: none;
		}
		header h3 {
			margin-right: auto;
			white-space: nowrap;
		}
		.tile .shopping {
			grid-template-columns: minmax(0, 1fr);
		}
		.tasks .title {
			white-space: normal;
			line-height: 1.2;
		}
	}
	@container (max-width: 340px) {
		header h3 {
			font-size: 18px;
			letter-spacing: 0.04em;
		}
	}
	header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 10px;
	}
	.n {
		display: inline-block;
		min-width: 30px;
		padding: 0 8px;
		border-radius: 999px;
		background: var(--line);
		color: var(--fg);
		text-align: center;
		letter-spacing: 0;
	}
	.all {
		margin-left: auto;
		font: 600 19px var(--font-body);
		color: var(--muted);
	}
	h3 {
		margin: 0;
		font-family: var(--font-head);
		font-size: 20px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.add {
		width: 64px;
		height: var(--tile-head, 56px);
		border-radius: 14px;
		border: 3px solid var(--line);
		background: var(--event-bg);
		color: var(--fg);
		font: 700 34px var(--font-body);
	}
	.muted {
		color: var(--muted);
		font-size: 24px;
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* Pasek postępu przytrzymania */
	li,
	.note {
		position: relative;
		overflow: hidden;
		touch-action: none;
		transition: transform 0.1s;
	}
	li::after,
	.note::after {
		content: '';
		position: absolute;
		left: 0;
		bottom: 0;
		height: 6px;
		width: calc(var(--hold, 0) * 100%);
		background: #22a447;
	}
	:global(.holding) {
		transform: scale(0.98);
	}
	.shopping {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 18px;
		font-size: 25px;
	}
	.shopping li {
		display: flex;
		gap: 10px;
		align-items: center;
		white-space: nowrap;
		padding: 2px 4px;
		border-radius: 8px;
	}
	.shopping small {
		margin-left: 8px;
		color: var(--muted);
		font-size: 19px;
	}
	.icon {
		font-size: 28px;
		width: 34px;
		text-align: center;
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.note {
		background: var(--note);
		border-top: 6px solid var(--c);
		border-radius: 6px;
		padding: 8px 12px;
		font-size: 24px;
	}
	.author {
		display: block;
		font-size: 16px;
		font-weight: 700;
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
	.tasks {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 24px;
	}
	.tasks li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 10px;
		border-radius: var(--radius-s);
		border-left: 7px solid var(--c);
		background: var(--event-bg);
	}
	.tasks li.bin {
		background: color-mix(in srgb, var(--c) 16%, var(--card));
	}
	.tasks li.overdue .title::after {
		content: ' · ' attr(data-overdue);
		color: var(--alert);
		font-size: 18px;
		font-weight: 600;
	}
	.box {
		width: 26px;
		height: 26px;
		border: 3px solid var(--muted);
		border-radius: 8px;
		flex: none;
	}
	.title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who {
		font-size: 18px;
		font-weight: 650;
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
</style>
