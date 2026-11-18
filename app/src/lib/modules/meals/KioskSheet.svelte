<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Sheet from '#lib/components/kiosk/Sheet.svelte';
	import Keyboard from '#lib/components/kiosk/Keyboard.svelte';
	import { addDays } from '#lib/logic/dates.js';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import { inSentence, t, tn } from '#lib/i18n/index.js';
	import type { MealSlot } from '#lib/logic/meals.js';
	import type { MealDay } from '../p3b-data.js';
	import type { Dashboard } from '#lib/types.js';

	/**
	 * Okno planu posiłków na kiosku: 7 dni × pory, dotknięcie pola → wybór przepisu (albo własny tekst),
	 * „Brakujące na listę” → składniki, których nie ma w domu, do zaznaczenia i dopisania do zakupów.
	 */
	let { data, onclose, onchanged }: { data: Dashboard; onclose: () => void; onchanged: () => void } = $props();

	type Recipe = { id: number; name: string; emoji: string; ingredients: { name: string }[] };
	type MissingItem = { name: string; label: string; recipes: string[] };

	// Stan okna startuje z danych ekranu, potem żyje własnym życiem (przewijanie tygodni).
	let from = $state(untrack(() => data.today));
	let slots = $state<MealSlot[]>(untrack(() => data.modules.meals?.slots ?? ['lunch']));
	let days = $state<MealDay[]>(untrack(() => data.modules.meals?.days ?? []));
	let recipes = $state<Recipe[]>([]);
	let view = $state<'week' | 'pick' | 'type' | 'missing'>('week');
	let target = $state<{ date: string; slot: MealSlot; current: string } | null>(null);
	let text = $state('');
	let busy = $state(false);
	let failed = $state(false);
	let missing = $state<{ items: MissingItem[]; days: number; usesPantry: boolean } | null>(null);
	let chosen = $state(new Set<string>());
	let added = $state<string[] | null>(null);

	const JSON_HEADERS = { 'content-type': 'application/json' };

	async function load() {
		try {
			const r = await fetch(`/api/meals?from=${from}`);
			if (!r.ok) throw new Error();
			const d = await r.json();
			slots = d.slots;
			days = d.days;
			recipes = d.recipes;
			failed = false;
		} catch {
			failed = true;
		}
	}
	onMount(load);

	const go = (n: number) => {
		from = n === 0 ? data.today : addDays(from, n);
		void load();
	};

	function dayLabel(d: string) {
		if (d === data.today) return t('common.today');
		if (d === addDays(data.today, 1)) return t('common.tomorrow');
		return dayHeader(d).wd;
	}

	function pick(date: string, slot: MealSlot, current: string) {
		target = { date, slot, current };
		view = 'pick';
	}

	async function save(body: { recipeId?: number; name?: string }) {
		if (!target) return;
		busy = true;
		try {
			const r = await fetch('/api/meals', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ date: target.date, slot: target.slot, ...body }) });
			if (!r.ok) throw new Error();
			await load();
			onchanged();
			view = 'week';
			target = null;
			text = '';
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	async function openMissing() {
		view = 'missing';
		added = null;
		missing = null;
		try {
			const r = await fetch('/api/meals/missing');
			if (!r.ok) throw new Error();
			missing = await r.json();
			chosen = new Set(missing!.items.map((i) => i.name));
		} catch {
			failed = true;
		}
	}

	function toggle(name: string) {
		const s = new Set(chosen);
		if (s.has(name)) s.delete(name);
		else s.add(name);
		chosen = s;
	}

	async function addChosen() {
		busy = true;
		try {
			const r = await fetch('/api/meals/missing', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ names: [...chosen] }) });
			if (!r.ok) throw new Error();
			added = (await r.json()).added;
			onchanged();
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	const slotName = (s: MealSlot) => t(`meals.slot.${s}`);
	const title = $derived(
		view === 'missing' ? `🛒 ${t('meals.missing')}` : view === 'week' ? `🍽️ ${t('meals.planWeek')}` : `${slotName(target!.slot)} · ${dayLabel(target!.date)} ${fmtShortDate(target!.date)}`
	);
</script>

<Sheet {title} {onclose} closeLabel="✕ {t('common.close')}">
	{#if view === 'week'}
		<div class="grid" style:--cols={days.length} style:--rows={slots.length}>
			{#each days as d (d.date)}
				<div class="head" class:today={d.date === data.today} class:weekend={dayHeader(d.date).weekend}>
					<b>{dayLabel(d.date)}</b><span>{fmtShortDate(d.date)}</span>
				</div>
			{/each}
			{#each slots as s, si (s)}
				{#each days as d (d.date)}
					{@const m = d.meals[si]}
					<button type="button" class="cell" class:empty={!m?.name} class:today={d.date === data.today} data-meal="{d.date}:{s}" onclick={() => pick(d.date, s, m?.name ?? '')}>
						{#if slots.length > 1}<span class="slot">{slotName(s)}</span>{/if}
						{#if m?.name}
							<span class="emo">{m.emoji}</span>
							<span class="name">{m.name}</span>
							{@const ing = recipes.find((r) => r.id === m.recipeId)?.ingredients ?? []}
							{#if ing.length && slots.length === 1}
								<span class="ing">{ing.slice(0, 6).map((i) => i.name).join(' · ')}{ing.length > 6 ? ' …' : ''}</span>
							{/if}
						{:else}
							<span class="plus">+</span>
						{/if}
					</button>
				{/each}
			{/each}
		</div>
		{#if failed}<p class="error">{t('add.saveFailed')}</p>{/if}
	{:else if view === 'pick' && target}
		<p class="label">{t('meals.chooseFor', { slot: inSentence(slotName(target.slot)) })}</p>
		<div class="recipes">
			{#each recipes as r (r.id)}
				<button type="button" class="recipe" class:on={r.name === target.current} disabled={busy} onclick={() => save({ recipeId: r.id })}>
					<span class="emo">{r.emoji}</span>
					<span class="name">{r.name}</span>
				</button>
			{:else}
				<p class="muted">{t('meals.noRecipes')}</p>
			{/each}
		</div>
		<div class="spacer"></div>
	{:else if view === 'type'}
		<div class="field">{text}<span class="caret"></span>{#if !text}<span class="ph"> {t('meals.dishPlaceholder')}</span>{/if}</div>
		<div class="spacer"></div>
		<Keyboard bind:value={text} max={80} onenter={() => text.trim() && save({ name: text.trim() })} enterLabel="✓ {t('common.save')}" enterDisabled={!text.trim() || busy} onback={() => (view = 'pick')} />
	{:else if view === 'missing'}
		{#if !missing}
			<p class="muted">…</p>
		{:else if added}
			<div class="done">
				<div class="check">✓</div>
				<p>{added.length ? t('meals.addedList', { list: added.join(', ') }) : t('meals.allThere')}</p>
			</div>
		{:else}
			<p class="label">{tn('meals.missingDays', missing.days)}{missing.usesPantry ? ` · ${t('meals.pantryUsed')}` : ''}</p>
			{#if missing.items.length}
				<div class="missing">
					{#each missing.items as m (`${m.name}|${m.label}`)}
						<button type="button" class="miss" class:on={chosen.has(m.name)} aria-pressed={chosen.has(m.name)} onclick={() => toggle(m.name)}>
							<span class="box">{chosen.has(m.name) ? '✓' : ''}</span>
							<span class="txt"><b>{m.name}</b>{#if m.label}<em>{m.label}</em>{/if}<small>{t('meals.forRecipes', { list: m.recipes.join(', ') })}</small></span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="muted">{t('meals.allThere')} ✨</p>
			{/if}
		{/if}
		{#if failed}<p class="error">{t('add.saveFailed')}</p>{/if}
	{/if}

	{#snippet footer()}
		{#if view === 'week'}
			<button type="button" class="btn" aria-label={t('meals.earlier')} onclick={() => go(-7)}>←</button>
			<button type="button" class="btn" disabled={from === data.today} onclick={() => go(0)}>{t('meals.thisWeek')}</button>
			<button type="button" class="btn" aria-label={t('meals.later')} onclick={() => go(7)}>→</button>
			<span class="grow"></span>
			<button type="button" class="btn primary" onclick={openMissing}>🛒 {t('meals.toShopping')}</button>
		{:else if view === 'pick'}
			<button type="button" class="btn" onclick={() => ((view = 'week'), (target = null))}>← {t('common.back')}</button>
			<span class="grow"></span>
			{#if target?.current}<button type="button" class="btn" disabled={busy} onclick={() => save({ name: '' })}>✕ {t('meals.clear')}</button>{/if}
			<button type="button" class="btn" onclick={() => ((text = ''), (view = 'type'))}>⌨ {t('meals.typeOwn')}</button>
		{:else if view === 'missing'}
			<button type="button" class="btn" onclick={() => (view = 'week')}>← {t('common.back')}</button>
			<span class="grow"></span>
			{#if missing && !added && missing.items.length}
				<button type="button" class="btn primary" disabled={!chosen.size || busy} onclick={addChosen}>🛒 {tn('meals.addN', chosen.size)}</button>
			{/if}
		{/if}
	{/snippet}
</Sheet>

<style>
	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		grid-template-rows: auto repeat(var(--rows), minmax(0, 1fr));
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 0 6px;
		font-size: 26px;
	}
	.head b {
		font: 700 30px var(--font-head);
	}
	.head span {
		color: var(--muted);
	}
	.head.weekend b {
		color: var(--alert);
	}
	.head.today b {
		text-decoration: underline 4px;
		text-underline-offset: 8px;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 16px 12px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 650 28px/1.2 var(--font-body);
		text-align: center;
		min-height: 0;
		overflow: hidden;
	}
	.cell.today {
		border-color: var(--fg);
	}
	.cell.empty {
		background: transparent;
		border-style: dashed;
	}
	.cell:active {
		transform: scale(0.98);
	}
	.slot {
		font: 700 17px var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.cell .emo {
		font-size: 58px;
		line-height: 1;
	}
	.cell .name {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.ing {
		font: 500 20px/1.35 var(--font-body);
		color: var(--muted);
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.plus {
		font-size: 60px;
		font-weight: 300;
		color: var(--muted);
	}
	.label {
		margin: 0;
	}
	.recipes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
		overflow-y: auto;
		touch-action: pan-y;
		min-height: 0;
	}
	.recipe {
		display: flex;
		align-items: center;
		gap: 18px;
		min-height: 110px;
		padding: 14px 22px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 650 30px/1.2 var(--font-body);
		text-align: left;
	}
	.recipe.on {
		border-color: var(--fg);
		box-shadow: inset 0 0 0 2px var(--fg);
	}
	.recipe .emo {
		font-size: 52px;
	}
	.spacer {
		flex: 1;
	}
	.grow {
		flex: 1;
	}
	.muted {
		color: var(--muted);
		font-size: 30px;
		margin: 0;
	}
	.error {
		color: var(--alert);
		font-size: 28px;
		font-weight: 700;
		margin: 0;
	}
	.missing {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px 22px;
		overflow-y: auto;
		touch-action: pan-y;
		min-height: 0;
		align-content: start;
	}
	.miss {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 14px 20px;
		border-radius: 16px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		text-align: left;
		font: 30px var(--font-body);
		opacity: 0.6;
	}
	.miss.on {
		opacity: 1;
		border-color: var(--fg);
	}
	.box {
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 3px solid var(--muted);
		display: grid;
		place-items: center;
		font-weight: 800;
	}
	.miss.on .box {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--card);
	}
	.txt {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		min-width: 0;
	}
	.txt em {
		font-style: normal;
		color: var(--muted);
		font-weight: 600;
	}
	.txt small {
		flex-basis: 100%;
		font-size: 20px;
		color: var(--muted);
	}
	.done {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 34px;
		text-align: center;
	}
	.done p {
		margin: 0;
		max-width: 1200px;
	}
	.check {
		font-size: 140px;
		line-height: 1;
		color: #22a447;
	}
</style>
