<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import { ingredientLine } from '#lib/logic/meals.js';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t, tn } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
	const m = $derived(data.meals);
	const err = (s: string) => msg(form, s)?.error;
</script>

<section id="posilki" class="adm-sec">
	<h2>🍽️ {t('module.meals')}</h2>

	<h3>{t('meals.admin.plan')}</h3>
	<p class="hint">{t('meals.admin.planHint')}</p>
	{#if err('mealPlan')}<p class="err">{err('mealPlan')}</p>{/if}
	<datalist id="meal-recipes">{#each m.recipes as r (r.id)}<option value={r.name}></option>{/each}</datalist>
	<div class="rows plan">
		{#each m.days as d (d.date)}
			<div class="row item" class:today={d.date === data.today} style:--c={dayHeader(d.date).weekend ? 'var(--alert)' : undefined}>
				<b class="date">{dayHeader(d.date).wd} {fmtShortDate(d.date)}</b>
				{#each d.meals as meal (meal.slot)}
					<form method="POST" action="?/saveMealPlan" use:enhance={keep} class="cell">
						<input type="hidden" name="date" value={d.date} />
						<input type="hidden" name="slot" value={meal.slot} />
						<label class="grow"
							>{t(`meals.slot.${meal.slot}`)}
							<input name="name" value={meal.name} list="meal-recipes" maxlength="80" placeholder="—" autocomplete="off" />
						</label>
						<button>{t('common.save')}</button>
					</form>
				{/each}
			</div>
		{/each}
	</div>

	<h3>🛒 {t('meals.missing')}</h3>
	<p class="hint">{tn('meals.missingDays', m.missing.days)}{m.missing.usesPantry ? ` · ${t('meals.pantryUsed')}` : ''}</p>
	{#if err('mealMissing')}<p class="err">{err('mealMissing')}</p>{:else if msg(form, 'mealMissing')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	{#if m.missing.items.length}
		<form method="POST" action="?/addMissingMeals" use:enhance class="rows">
			<div class="row missing">
				{#each m.missing.items as i (`${i.name}|${i.label}`)}
					<label class="check"><input type="checkbox" name="name" value={i.name} checked /> <b>{i.name}</b> {i.label} <span class="muted">({i.recipes.join(', ')})</span></label>
				{/each}
			</div>
			<div><button class="primary">🛒 {tn('meals.addN', m.missing.items.length)}</button></div>
		</form>
	{:else}
		<p class="muted">{t('meals.allThere')}</p>
	{/if}

	<h3>📖 {t('meals.recipes')}</h3>
	{#if err('meals')}<p class="err">{err('meals')}</p>{/if}
	<p class="hint">{t('meals.ingredientsHint')}</p>
	<div class="rows">
		{#each m.recipes as r (r.id)}
			<form method="POST" action="?/saveRecipe" use:enhance={keep} class="row recipe">
				<input type="hidden" name="id" value={r.id} />
				<label>{t('p3b.icon')} <input name="emoji" value={r.emoji} size="3" /></label>
				<label class="grow">{t('meals.recipeName')} <input name="name" value={r.name} required maxlength="60" /></label>
				<label class="wide">{t('meals.ingredients')} ({tn('meals.ingredientsN', r.ingredients.length)}) <textarea name="ingredients" rows={Math.min(8, Math.max(3, r.ingredients.length))}>{r.ingredients.map(ingredientLine).join('\n')}</textarea></label>
				<label class="wide">{t('meals.notes')} <input name="notes" value={r.notes} maxlength="1000" /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteRecipe" class="danger">{t('common.delete')}</button>
			</form>
		{/each}
		<form method="POST" action="?/saveRecipe" use:enhance class="row new recipe">
			<label>{t('p3b.icon')} <input name="emoji" value="🍽️" size="3" /></label>
			<label class="grow">{t('meals.recipeName')} <input name="name" required maxlength="60" placeholder={t('meals.dishPlaceholder')} /></label>
			<label class="wide">{t('meals.ingredients')} <textarea name="ingredients" rows="4"></textarea></label>
			<label class="wide">{t('meals.notes')} <input name="notes" maxlength="1000" /></label>
			<button class="primary">{t('meals.addRecipe')}</button>
		</form>
	</div>
</section>

<style>
	.plan {
		grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
	}
	.plan .row {
		align-items: end;
		padding: 8px 10px;
		gap: 6px 10px;
	}
	.plan .today {
		box-shadow: inset 0 0 0 2px var(--fg);
	}
	.date {
		flex: 1 1 100%;
	}
	.cell {
		display: flex;
		gap: 8px;
		align-items: end;
		flex: 1 1 100%;
	}
	.missing {
		flex-direction: column;
		align-items: flex-start;
	}
	.recipe .wide {
		flex: 1 1 100%;
	}
	textarea {
		font: 15px/1.4 var(--font-body);
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		resize: vertical;
	}
</style>
