<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { t } from '#lib/i18n/index.js';
	import type { SnakeEventType } from '#lib/logic/snakes.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	const EV_ICON = { feed: '🍽', refused: '✋', shed: '🐍', clean: '🧽', weight: '⚖️' } as const;
	const evLabel = (k: SnakeEventType) => `${EV_ICON[k]} ${t(`snakes.event.${k}`)}`;
	const foodName = (id: string | null) => data.snakes.food.find((x) => x.id === id)?.label ?? '';
</script>

<section id="weze" class="adm-sec">
	<h2>{t('module.snakes')}</h2>
	{#if msg(form, 'snakes')?.error}<p class="err">{msg(form, 'snakes')?.error}</p>{/if}
	<div class="rows">
		{#each data.snakes.snakes as w (w.id)}
			<form method="POST" action="?/saveSnake" use:enhance={keep} class="row" style:--c={w.color}>
				<input type="hidden" name="id" value={w.id} />
				<span class="swatch"></span>
				<label>{t('setup.members.color')} <input type="color" name="color" value={w.color} /></label>
				<label>{t('setup.members.name')} <input name="name" value={w.name} required maxlength="40" /></label>
				<label class="grow">{t('snakes.admin.species')} <input name="species" value={w.species} maxlength="60" /></label>
				<label>{t('snakes.admin.sex')}
					<select name="sex" value={w.sex}><option value="M">♂ {t('snakes.admin.male')}</option><option value="F">♀ {t('snakes.admin.female')}</option><option value="?">?</option></select>
				</label>
				<label>{t('snakes.admin.year')} <input name="born" value={w.born} maxlength="20" size="9" /></label>
				<label>{t('snakes.admin.from')} <input type="number" name="intervalDays" min="1" max="120" value={w.intervalAuto ? '' : w.interval} placeholder="{t('pantry.admin.auto')}: {w.interval}" /></label>
				<label>{t('snakes.admin.to')} <input type="number" name="intervalMax" min="1" max="120" value={w.intervalAuto || w.intervalTo === w.interval ? '' : w.intervalTo} placeholder="—" /></label>
				<label>{t('snakes.admin.pauseUntil')} <input type="date" name="pauseUntil" value={w.pauseUntil ?? ''} /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteSnake" class="danger" onclick={(e) => !confirm(t('snakes.admin.confirmDelete', { name: w.name })) && e.preventDefault()}>{t('common.delete')}</button>
			</form>
			<details class="history">
				<summary>{t('snakes.history')} {w.name} ({w.events.length})</summary>
				<form method="POST" action="?/addSnakeEvent" use:enhance={keep} class="row new">
					<input type="hidden" name="snakeId" value={w.id} />
					<label>{t('snakes.admin.type')}
						<select name="type">{#each Object.keys(EV_ICON) as SnakeEventType[] as k (k)}<option value={k}>{evLabel(k)}</option>{/each}</select>
					</label>
					<label>{t('admin.events.day')} <input type="date" name="date" value={data.today} required /></label>
					<label>{t('snakes.food')}
						<select name="food"><option value="">—</option>{#each data.snakes.food as x (x.id)}<option value={x.id}>{x.label}</option>{/each}</select>
					</label>
					<label>{t('snakes.admin.weight')} <input type="number" name="grams" min="1" max="50000" /></label>
					<button class="primary">{t('snakes.admin.addEntry')}</button>
				</form>
				<div class="chips">
					{#each w.events as e (e.id)}
						<form method="POST" action="?/deleteSnakeEvent" use:enhance class="chip">
							<input type="hidden" name="id" value={e.id} />
							<span>{e.date} · {evLabel(e.type)}{e.food ? ` · ${foodName(e.food)}` : ''}{e.grams ? ` · ${e.grams} g` : ''}</span><button class="x" title={t('snakes.admin.deleteEntry')}>✕</button>
						</form>
					{/each}
				</div>
			</details>
		{/each}
		<form method="POST" action="?/saveSnake" use:enhance class="row new">
			<span class="swatch"></span>
			<label>{t('setup.members.color')} <input type="color" name="color" value="#2f9e44" /></label>
			<label>{t('setup.members.name')} <input name="name" required maxlength="40" placeholder={t('snakes.admin.newSnake')} /></label>
			<label class="grow">{t('snakes.admin.species')} <input name="species" maxlength="60" /></label>
			<label>{t('snakes.admin.sex')} <select name="sex"><option value="M">♂ {t('snakes.admin.male')}</option><option value="F">♀ {t('snakes.admin.female')}</option><option value="?">?</option></select></label>
			<label>{t('snakes.admin.year')} <input name="born" maxlength="20" size="9" /></label>
			<label>{t('snakes.admin.from')} <input type="number" name="intervalDays" min="1" max="120" placeholder={t('pantry.admin.auto')} /></label>
			<label>{t('snakes.admin.to')} <input type="number" name="intervalMax" min="1" max="120" placeholder="—" /></label>
			<button class="primary">{t('snakes.admin.addSnake')}</button>
		</form>
	</div>
	<p class="hint">{t('snakes.admin.hint')}</p>

	<h3>{t('snakes.food')}</h3>
	{#if msg(form, 'food')?.error}<p class="err">{msg(form, 'food')?.error}</p>{/if}
	<div class="rows">
		{#each data.snakes.food as x (x.id)}
			<form method="POST" action="?/saveFood" use:enhance={keep} class="row">
				<input type="hidden" name="id" value={x.id} />
				<label class="grow">{t('snakes.admin.size')} <input name="label" value={x.label} required maxlength="20" /></label>
				<label>{t('snakes.admin.count')} <input type="number" name="count" min="0" max="999" value={x.count} /></label>
				<label>{t('snakes.admin.warnBelow')} <input type="number" name="minCount" min="0" max="999" value={x.minCount} /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteFood" class="danger">{t('common.delete')}</button>
			</form>
		{/each}
		<form method="POST" action="?/saveFood" use:enhance class="row new">
			<label class="grow">{t('snakes.admin.size')} <input name="label" required maxlength="20" placeholder={t('snakes.admin.sizePlaceholder')} /></label>
			<label>{t('snakes.admin.count')} <input type="number" name="count" min="0" max="999" value="0" /></label>
			<label>{t('snakes.admin.warnBelow')} <input type="number" name="minCount" min="0" max="999" value="2" /></label>
			<button class="primary">{t('snakes.admin.addSize')}</button>
		</form>
	</div>
</section>
