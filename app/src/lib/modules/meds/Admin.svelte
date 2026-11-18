<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, memberColor, memberName, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import MemberSelect from '#lib/components/admin/MemberSelect.svelte';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import type { MedPlan } from '#lib/logic/meds.js';
	import { fmtShortDate, weekdaysShort } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	const WD = weekdaysShort();
	const daysLabel = (m: MedPlan) => (m.days.length === 0 || m.days.length === 7 ? t('meds.everyDay') : m.days.map((d) => WD[d - 1]).join(', '));
</script>

<section id="leki" class="adm-sec">
	<h2>{t('module.meds')}</h2>
	<p class="hint privacy">🔒 {t('meds.admin.privacy')}</p>
	{#if msg(form, 'meds')?.error}<p class="err">{msg(form, 'meds')?.error}</p>{/if}
	<div class="rows">
		{#each data.meds as m (m.id)}
			{@render medForm(m)}
			<div class="hist" style:--c={memberColor(data.members, m.memberId)}>
				<span class="muted">{memberName(data.members, m.memberId)} · {m.times.join(', ')} · {daysLabel(m)}{m.active ? '' : ` · ${t('meds.admin.paused')}`}</span>
				<span class="days">
					{#each m.history as h (h.date)}
						<span class="pill" class:good={h.taken >= h.planned} class:bad={h.taken < h.planned} title={t('meds.admin.dayTitle', { date: fmtShortDate(h.date), taken: h.taken, planned: h.planned })}>{fmtShortDate(h.date)} {h.taken}/{h.planned}</span>
					{:else}
						<span class="muted">{t('meds.admin.noHistory')}</span>
					{/each}
				</span>
			</div>
		{/each}
		{@render medForm(null)}
	</div>
	<p class="hint">{t('meds.admin.hint')}</p>
</section>

{#snippet medForm(m: MedPlan | null)}
	<form method="POST" action="?/saveMed" use:enhance={m ? keep : undefined} class="row" class:new={!m} style:--c={m ? memberColor(data.members, m.memberId) : undefined}>
		{#if m}<input type="hidden" name="id" value={m.id} />{/if}
		<label class="grow">{t('meds.name')} <input name="name" value={m?.name ?? ''} required maxlength="60" placeholder={m ? '' : t('meds.admin.newPlaceholder')} /></label>
		<label>{t('meds.dose')} <input name="dose" value={m?.dose ?? ''} maxlength="40" size="10" /></label>
		<MemberSelect members={data.members} selected={m?.memberId ?? null} />
		<label>{t('meds.times')} <input name="times" value={m?.times.join(', ') ?? '08:00'} required size="14" placeholder="08:00, 20:00" /></label>
		<span class="days">
			{#each WD as d, i (d)}
				<label class="day"><input type="checkbox" name="days" value={i + 1} checked={!!m && m.days.includes(i + 1)} />{d}</label>
			{/each}
		</span>
		<label>{t('meds.admin.from')} <input type="date" name="startDate" value={m?.startDate ?? ''} /></label>
		<label>{t('meds.admin.until')} <input type="date" name="endDate" value={m?.endDate ?? ''} /></label>
		{#if m}<label class="check"><input type="checkbox" name="active" checked={m.active} /> {t('meds.admin.active')}</label>{/if}
		<button class:primary={!m}>{m ? t('common.save') : t('meds.admin.add')}</button>
		{#if m}<button formaction="?/deleteMed" class="danger" onclick={(e) => !confirm(t('meds.admin.confirmDelete', { name: m.name })) && e.preventDefault()}>{t('common.delete')}</button>{/if}
	</form>
{/snippet}

<style>
	.hist {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		align-items: center;
		padding: 0 4px 10px 12px;
		border-left: 4px solid var(--c);
		margin: -4px 0 6px;
	}
	.hist .days {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.privacy {
		background: color-mix(in srgb, #22a447 10%, transparent);
		border-radius: 8px;
		padding: 8px 12px;
	}
</style>
