<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import AddSheet from '#lib/components/phone/AddSheet.svelte';
	import Fold from '#lib/components/phone/Fold.svelte';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { addDays } from '#lib/logic/dates.js';
	import { ingredientLine } from '#lib/logic/meals.js';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import { t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = $derived(data.meals);
	const dayLabel = (d: string) => (d === data.today ? t('common.today') : d === addDays(data.today, 1) ? t('common.tomorrow') : `${dayHeader(d).wd} ${fmtShortDate(d)}`);

	async function setMeal(date: string, slot: string, name: string, el: HTMLInputElement) {
		try {
			await api('/api/meals', 'POST', { date, slot, name: name.trim() });
			await invalidateAll();
			say(`✓ ${name.trim() || t('meals.clear')}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
			el.value = el.defaultValue;
		}
	}

	// Braki: domyślnie wszystkie zaznaczone; odznaczone pamiętamy po nazwie.
	const off = new SvelteSet<string>();
	const chosen = $derived(data.missing.items.filter((i) => !off.has(i.name)).map((i) => i.name));
	let busy = $state(false);
	async function addMissing() {
		busy = true;
		try {
			const r = await api<{ added: string[] }>('/api/meals/missing', 'POST', { names: chosen });
			await invalidateAll();
			say(`🛒 ${t('meals.addedList', { list: r.added.join(', ') })}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}

	let adding = $state(false);
	let name = $state('');
	let emoji = $state('🍽️');
	let ingredients = $state('');
	async function addRecipe() {
		busy = true;
		try {
			await api('/api/meals/recipes', 'POST', { name, emoji, ingredients });
			name = '';
			ingredients = '';
			emoji = '🍽️';
			adding = false;
			await invalidateAll();
			say(`✓ ${t('meals.addRecipe')}`);
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
		busy = false;
	}
</script>

<datalist id="recipes">{#each m.recipes as r (r.id)}<option value={r.name}></option>{/each}</datalist>

{#each m.days as d (d.date)}
	<div class="ph-card day" class:today={d.date === data.today}>
		<div class="when">{dayLabel(d.date)}</div>
		{#each d.meals as meal (meal.slot)}
			<label class="slot">
				{#if m.slots.length > 1}<span class="ph-muted">{t(`meals.slot.${meal.slot}`)}</span>{/if}
				<span class="emo">{meal.emoji || '·'}</span>
				<input
					class="ph-input"
					list="recipes"
					value={meal.name}
					maxlength="80"
					placeholder={t('meals.nothing')}
					aria-label="{dayLabel(d.date)} {t(`meals.slot.${meal.slot}`)}"
					onchange={(e) => setMeal(d.date, meal.slot, e.currentTarget.value, e.currentTarget)}
				/>
			</label>
		{/each}
	</div>
{/each}

<div class="ph-label">🛒 {t('meals.missing')}</div>
<div class="ph-card">
	<p class="ph-muted small">{tn('meals.missingDays', data.missing.days)}{data.missing.usesPantry ? ` · ${t('meals.pantryUsed')}` : ''}</p>
	{#each data.missing.items as i (`${i.name}|${i.label}`)}
		<label class="miss">
			<input type="checkbox" checked={!off.has(i.name)} onchange={(e) => (e.currentTarget.checked ? off.delete(i.name) : off.add(i.name))} />
			<span><b>{i.name}</b>{#if i.label}<span class="ph-muted qty">{i.label}</span>{/if}<br /><small class="ph-muted">{t('meals.forRecipes', { list: i.recipes.join(', ') })}</small></span>
		</label>
	{:else}
		<p>{t('meals.allThere')}</p>
	{/each}
	{#if data.missing.items.length}
		<button type="button" class="ph-btn primary full" disabled={!chosen.length || busy} onclick={addMissing}>🛒 {tn('meals.addN', chosen.length)}</button>
	{/if}
</div>

<Fold id="posilki-przepisy" title="📖 {t('meals.recipes')}" aside={String(m.recipes.length)}>
	{#each m.recipes as r (r.id)}
		<div class="recipe">
			<b>{r.emoji} {r.name}</b>
			<span class="ph-muted">{r.ingredients.map(ingredientLine).join(' · ') || tn('meals.ingredientsN', 0)}</span>
		</div>
	{:else}
		<p class="ph-muted">{t('meals.noRecipes')}</p>
	{/each}
</Fold>

<AddSheet title={t('meals.addRecipe')} bind:open={adding}>
	<form onsubmit={(e) => (e.preventDefault(), addRecipe())}>
		<div class="ph-row">
			<input class="ph-input emoji" bind:value={emoji} maxlength="8" aria-label={t('p3b.icon')} />
			<input class="ph-input" bind:value={name} maxlength="60" placeholder={t('meals.recipeName')} />
		</div>
		<div class="ph-label">{t('meals.ingredients')}</div>
		<textarea class="ph-input" rows="6" bind:value={ingredients} placeholder={t('meals.ingredientsHint')}></textarea>
		<button class="ph-btn primary full" disabled={!name.trim() || busy}>✓ {t('meals.addRecipe')}</button>
	</form>
</AddSheet>

<style>
	.day {
		display: grid;
		gap: 8px;
	}
	.day.today {
		box-shadow: inset 0 0 0 2px var(--fg);
	}
	.when {
		font-weight: 800;
	}
	.slot {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.slot .ph-muted {
		font-size: 13px;
		font-weight: 700;
		min-width: 86px;
	}
	.emo {
		font-size: 22px;
		width: 28px;
		text-align: center;
	}
	.miss {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.qty {
		margin-left: 8px;
	}
	.miss input {
		flex: none;
		width: 22px;
		height: 22px;
		margin-top: 2px;
	}
	.small {
		margin: 0 0 6px;
		font-size: 14px;
	}
	.recipe {
		display: grid;
		gap: 2px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.recipe span {
		font-size: 14px;
	}
	.emoji {
		width: 64px;
		text-align: center;
		flex: none;
	}
	textarea {
		resize: vertical;
	}
	.full {
		width: 100%;
		margin-top: 14px;
	}
</style>
