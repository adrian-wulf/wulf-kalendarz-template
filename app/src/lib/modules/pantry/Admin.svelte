<script lang="ts">
	import { enhance } from '$app/forms';
	import { categories } from '#lib/logic/pantry.js';
	import { t } from '#lib/i18n/index.js';
	import { keep, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
</script>

<section id="zapasy" class="adm-sec">
	<h2>{t('module.pantry')}</h2>
	{#if msg(form, 'pantry')?.error}<p class="err">{msg(form, 'pantry')?.error}</p>{/if}
	<h3>{t('pantry.admin.places')}</h3>
	<div class="rows">
		{#each data.pantry.places as p (p.id)}
			<form method="POST" action="?/savePlace" use:enhance={keep} class="row">
				<input type="hidden" name="id" value={p.id} />
				<label>{t('pantry.admin.icon')} <input name="icon" value={p.icon} size="3" /></label>
				<label class="grow">{t('common.name')} <input name="name" value={p.name} required maxlength="30" /></label>
				<label class="check"><input type="checkbox" name="freezer" checked={p.freezer} /> {t('pantry.admin.freezerAge')}</label>
				<button>{t('common.save')}</button>
				<button formaction="?/deletePlace" class="danger" onclick={(e) => !confirm(t('pantry.admin.confirmPlace', { name: p.name })) && e.preventDefault()}>{t('common.delete')}</button>
			</form>
		{/each}
		<form method="POST" action="?/savePlace" use:enhance class="row new">
			<label>{t('pantry.admin.icon')} <input name="icon" value="📦" size="3" /></label>
			<label class="grow">{t('common.name')} <input name="name" required maxlength="30" placeholder={t('pantry.admin.placePlaceholder')} /></label>
			<label class="check"><input type="checkbox" name="freezer" /> {t('pantry.admin.freezer')}</label>
			<button class="primary">{t('pantry.admin.addPlace')}</button>
		</form>
	</div>

	<h3>{t('pantry.admin.items')}</h3>
	<datalist id="pantry-products">{#each data.pantry.products as x (x.id)}<option value={x.name}></option>{/each}</datalist>
	<div class="rows">
		{#each data.pantry.places as p (p.id)}
			{@const list = data.pantry.items.filter((i) => i.placeId === p.id)}
			<details class="history" open={list.length < 25}>
				<summary>{p.icon} {p.name} ({list.length})</summary>
				<form method="POST" action="?/addPantryItem" use:enhance={keep} class="row new">
					<input type="hidden" name="placeId" value={p.id} />
					<label class="grow">{t('pantry.admin.product')} <input name="name" required maxlength="60" list="pantry-products" placeholder={t('pantry.namePlaceholder')} autocomplete="off" /></label>
					<label>{t('pantry.admin.qty')} <input type="number" name="qty" min="1" max="999" value="1" /></label>
					<label>{t('pantry.category')}
						<select name="category"><option value="">{t('pantry.admin.auto')}</option>{#each categories() as [id, icon, label] (id)}<option value={id}>{icon} {label}</option>{/each}</select>
					</label>
					{#if p.freezer}<label>{t('pantry.frozenOn')} <input type="date" name="date" value={data.today} max={data.today} /></label>{/if}
					<label>{t('pantry.bestBefore')} <input type="date" name="bestBefore" /></label>
					<button class="primary">{t('admin.add')}</button>
				</form>
				{#each list as i (i.id)}
					<form method="POST" action="?/saveItem" use:enhance={keep} class="row">
						<input type="hidden" name="id" value={i.id} />
						<b class="grow">{i.product.icon ?? ''} {i.product.name}</b>
						<label>{t('pantry.admin.qty')} ({i.product.unit}) <input type="number" name="qty" min="0" max="999" value={i.qty} /></label>
						<label>{p.freezer ? t('pantry.frozenOn') : t('pantry.admin.added')} <input type="date" name="addedAt" value={i.addedAt} required /></label>
						<label>{t('pantry.bestBefore')} <input type="date" name="bestBefore" value={i.bestBefore ?? ''} /></label>
						<button>{t('common.save')}</button>
						<button formaction="?/deleteItem" class="danger">{t('common.delete')}</button>
					</form>
				{:else}
					<p class="muted">{t('pantry.admin.empty')}</p>
				{/each}
			</details>
		{/each}
	</div>

	<h3>{t('pantry.admin.products')}</h3>
	<div class="rows">
		{#each data.pantry.products as p (p.id)}
			<form method="POST" action="?/saveProduct" use:enhance={keep} class="row">
				<input type="hidden" name="id" value={p.id} />
				<label>{t('pantry.admin.icon')} <input name="icon" value={p.icon ?? ''} size="3" /></label>
				<label class="grow">{t('common.name')} <input name="name" value={p.name} required maxlength="60" /></label>
				<label>{t('pantry.category')}
					<select name="category" value={p.category}>{#each categories() as [id, icon, label] (id)}<option value={id}>{icon} {label}</option>{/each}</select>
				</label>
				<label>{t('pantry.admin.unit')} <input name="unit" value={p.unit} size="6" maxlength="12" /></label>
				<label>{t('pantry.admin.min')} <input type="number" name="minQty" min="0" max="999" value={p.minQty ?? ''} placeholder={t('pantry.admin.whenZero')} /></label>
				<span class="muted">{t('pantry.admin.uses', { n: p.uses })}</span>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteProduct" class="danger" onclick={(e) => !confirm(t('pantry.admin.confirmProduct', { name: p.name })) && e.preventDefault()}>{t('common.delete')}</button>
			</form>
		{:else}
			<p class="muted">{t('pantry.admin.productsEmpty')}</p>
		{/each}
		<form method="POST" action="?/saveProduct" use:enhance class="row new">
			<label>{t('pantry.admin.icon')} <input name="icon" size="3" /></label>
			<label class="grow">{t('common.name')} <input name="name" required maxlength="60" placeholder={t('pantry.admin.newProduct')} /></label>
			<label>{t('pantry.category')} <select name="category">{#each categories() as [id, icon, label] (id)}<option value={id}>{icon} {label}</option>{/each}</select></label>
			<label>{t('pantry.admin.unit')} <input name="unit" value={t('pantry.admin.defaultUnit')} size="6" maxlength="12" /></label>
			<label>{t('pantry.admin.min')} <input type="number" name="minQty" min="0" max="999" placeholder={t('pantry.admin.whenZero')} /></label>
			<button class="primary">{t('pantry.admin.addProduct')}</button>
		</form>
	</div>
	<p class="hint">{t('pantry.admin.hint')}</p>
</section>
