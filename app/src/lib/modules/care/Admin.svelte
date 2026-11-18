<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import MemberSelect from '#lib/components/admin/MemberSelect.svelte';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { careInterval, careWhen, type CareView } from '#lib/logic/care.js';
	import { fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	const ICONS = ['🪴', '🌿', '🌵', '🌸', '💧', '☕', '🐟', '🐈', '🧺', '🧹', '🔋', '🚗'];
</script>

<section id="opieka" class="adm-sec">
	<h2>{t('module.care')}</h2>
	{#if msg(form, 'care')?.error}<p class="err">{msg(form, 'care')?.error}</p>{/if}
	<div class="rows">
		{#each data.care as c (c.id)}
			{@render itemForm(c)}
			<details class="history">
				<summary>{careWhen(c, data.today)} · {careInterval(c)} · {t('care.admin.history')} ({data.careHistory[c.id]?.length ?? 0})</summary>
				<form method="POST" action="?/markCareDone" use:enhance={keep} class="row new">
					<input type="hidden" name="id" value={c.id} />
					<label>{t('admin.events.day')} <input type="date" name="date" value={data.today} max={data.today} required /></label>
					<button class="primary">✓ {t('care.admin.markDone')}</button>
				</form>
				<div class="chips">
					{#each data.careHistory[c.id] ?? [] as l (l.id)}
						<form method="POST" action="?/deleteCareLog" use:enhance class="chip">
							<input type="hidden" name="id" value={l.id} />
							<span>{fmtShortDate(l.date)}</span><button class="x" title={t('common.delete')}>✕</button>
						</form>
					{/each}
				</div>
			</details>
		{/each}
		{@render itemForm(null)}
	</div>
	<p class="hint">{t('care.admin.hint')}</p>
</section>

{#snippet itemForm(c: CareView | null)}
	<form method="POST" action="?/saveCareItem" use:enhance={c ? keep : undefined} class="row" class:new={!c}>
		{#if c}<input type="hidden" name="id" value={c.id} />{/if}
		<label>{t('care.icon')}
			<input name="icon" value={c?.icon ?? '🪴'} list="care-icons" size="3" maxlength="8" />
		</label>
		<label class="grow">{t('common.name')} <input name="name" value={c?.name ?? ''} required maxlength="60" placeholder={c ? '' : t('care.admin.placeholder')} /></label>
		<label>{t('care.admin.from')} <input type="number" name="minDays" min="1" max="365" value={c?.minDays ?? 7} required /></label>
		<label>{t('care.admin.to')} <input type="number" name="maxDays" min="1" max="365" value={c && c.maxDays !== c.minDays ? c.maxDays : ''} placeholder="—" /></label>
		<MemberSelect members={data.members} selected={c?.memberId ?? null} />
		{#if c}
			<label>{t('care.admin.pauseUntil')} <input type="date" name="pauseUntil" value={c.pauseUntil ?? ''} /></label>
		{:else}
			<label>{t('care.admin.lastDone')} <input type="date" name="lastDone" max={data.today} value={data.today} /></label>
		{/if}
		<button class:primary={!c}>{c ? t('common.save') : t('care.admin.add')}</button>
		{#if c}<button formaction="?/deleteCareItem" class="danger" onclick={(e) => !confirm(t('care.admin.confirmDelete', { name: c.name })) && e.preventDefault()}>{t('common.delete')}</button>{/if}
	</form>
{/snippet}

<datalist id="care-icons">
	{#each ICONS as i (i)}<option value={i}></option>{/each}
</datalist>
