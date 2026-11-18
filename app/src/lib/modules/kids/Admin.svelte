<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, memberColor, memberName, msg, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import { weekdaysShort } from '#lib/format.js';
	import type { KidRepeat } from '#lib/server/db/schema.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { locale, t, tn } from '#lib/i18n/index.js';
	import { localZone } from '#lib/logic/dates.js';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();
	const k = $derived(data.kids);
	const err = (s: string) => msg(form, s)?.error;
	const WD = weekdaysShort();
	const fmt = $derived(new Intl.DateTimeFormat(locale(), { timeZone: localZone(), day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }));
	const when = (iso: string) => fmt.format(new Date(iso));
</script>

<section id="dzieci" class="adm-sec">
	<h2>⭐ {t('module.kids')}</h2>
	<p class="hint">{t('kids.admin.hint')}</p>

	<h3>🎁 {t('kids.pending')}</h3>
	{#if err('kidRequests')}<p class="err">{err('kidRequests')}</p>{/if}
	<div class="rows">
		{#each k.pending as p (p.id)}
			<form method="POST" action="?/decideRedemption" use:enhance class="row item" style:--c={memberColor(data.members, p.memberId)} data-request={p.id}>
				<input type="hidden" name="id" value={p.id} />
				<b>{p.emoji} {p.title}</b>
				<span>{memberName(data.members, p.memberId)} · {tn('kids.pts', p.cost)}</span>
				<span class="muted">{when(p.requestedAt)}</span>
				<span class="grow"></span>
				<button name="approve" value="0" class="danger">{t('kids.reject')}</button>
				<button name="approve" value="1" class="primary">✓ {t('kids.approve')}</button>
			</form>
		{:else}
			<p class="muted">{t('kids.admin.noPending')}</p>
		{/each}
	</div>

	<h3>⭐ {t('kids.points')}</h3>
	{#if err('kidPoints')}<p class="err">{err('kidPoints')}</p>{/if}
	<div class="rows">
		{#each k.kids as kid (kid.memberId)}
			<form method="POST" action="?/adjustKidPoints" use:enhance class="row" style:--c={kid.color}>
				<input type="hidden" name="memberId" value={kid.memberId} />
				<b class="kid">{kid.name}</b>
				<span class="pts" data-points={kid.memberId}>{kid.points} ⭐ <small class="muted">{t('kids.admin.available')}</small></span>
				<span class="muted">{t('kids.progress', { done: kid.done, total: kid.total })}</span>
				<span class="grow"></span>
				<label>{t('kids.admin.adjust')} <input type="number" name="delta" min="-500" max="500" step="1" placeholder="+5 / -3" required /></label>
				<label>{t('kids.admin.reason')} <input name="reason" maxlength="80" /></label>
				<button>{t('common.save')}</button>
			</form>
		{/each}
	</div>

	<h3>✅ {t('kids.admin.tasks')}</h3>
	{#if err('kidTasks')}<p class="err">{err('kidTasks')}</p>{/if}
	<div class="rows">
		{#each k.tasks as task (task.id)}
			{@render taskForm(task.id, task.memberId, task.emoji, task.title, task.points, task.repeat)}
		{/each}
		{@render taskForm(null, k.kids[0]?.memberId ?? null, '⭐', '', 1, { type: 'daily' })}
	</div>

	<h3>🎁 {t('kids.rewards')}</h3>
	{#if err('kidRewards')}<p class="err">{err('kidRewards')}</p>{/if}
	<div class="rows">
		{#each k.rewards as r (r.id)}
			<form method="POST" action="?/saveKidReward" use:enhance={keep} class="row">
				<input type="hidden" name="id" value={r.id} />
				<label>{t('p3b.icon')} <input name="emoji" value={r.emoji} size="3" /></label>
				<label class="grow">{t('kids.reward')} <input name="title" value={r.title} required maxlength="60" /></label>
				<label>{t('kids.cost')} <input type="number" name="cost" value={r.cost} min="1" max="10000" required /></label>
				<button>{t('common.save')}</button>
				<button formaction="?/deleteKidReward" class="danger">{t('common.delete')}</button>
			</form>
		{/each}
		<form method="POST" action="?/saveKidReward" use:enhance class="row new">
			<label>{t('p3b.icon')} <input name="emoji" value="🎁" size="3" /></label>
			<label class="grow">{t('kids.reward')} <input name="title" required maxlength="60" /></label>
			<label>{t('kids.cost')} <input type="number" name="cost" value="10" min="1" max="10000" required /></label>
			<button class="primary">{t('kids.admin.addReward')}</button>
		</form>
	</div>

	<details class="history">
		<summary>{t('kids.admin.history')} ({k.history.length})</summary>
		<table>
			<tbody>
				{#each k.history as h (h.id)}
					<tr>
						<td>{when(h.createdAt)}</td>
						<td>{memberName(data.members, h.memberId)}</td>
						<td>{h.reason}</td>
						<td class:neg={h.delta < 0}>{h.delta > 0 ? '+' : ''}{h.delta}</td>
					</tr>
				{/each}
				{#each k.decided as d (d.id)}
					<tr class="muted">
						<td>{d.decidedAt ? when(d.decidedAt) : ''}</td>
						<td>{memberName(data.members, d.memberId)}</td>
						<td>{d.emoji} {d.title} · {d.status === 'approved' ? t('kids.admin.approved') : t('kids.admin.rejected')}</td>
						<td>{d.decidedBy ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</section>

{#snippet taskForm(id: number | null, memberId: string | null, emoji: string, title: string, points: number, r: KidRepeat)}
	<form method="POST" action="?/saveKidTask" use:enhance={id ? keep : undefined} class="row task" class:new={!id} style:--c={memberColor(data.members, memberId)}>
		{#if id}<input type="hidden" name="id" value={id} />{/if}
		<label
			>{t('kids.admin.child')}
			<select name="memberId" required>
				{#each data.members as m (m.id)}<option value={m.id} selected={m.id === memberId}>{m.name}</option>{/each}
			</select>
		</label>
		<label>{t('p3b.icon')} <input name="emoji" value={emoji} size="3" /></label>
		<label class="grow">{t('kids.task')} <input name="title" value={title} required maxlength="60" /></label>
		<label>{t('kids.points')} <input type="number" name="points" value={points} min="1" max="100" required /></label>
		<label
			>{t('chores.repeat')}
			<select name="repeat">
				<option value="daily" selected={r.type === 'daily'}>{t('kids.repeat.daily')}</option>
				<option value="days" selected={r.type === 'days'}>{t('kids.repeat.days')}</option>
				<option value="weekly" selected={r.type === 'weekly'}>{t('kids.repeat.weekly')}</option>
			</select>
		</label>
		<span class="days">
			{#each WD as d, i (d)}
				<label class="day"><input type="checkbox" name="days" value={i + 1} checked={r.type === 'days' && r.days.includes(i + 1)} />{d}</label>
			{/each}
		</span>
		{#if id}
			<button>{t('common.save')}</button>
			<button formaction="?/deleteKidTask" class="danger">{t('common.delete')}</button>
		{:else}
			<button class="primary">{t('kids.admin.addTask')}</button>
		{/if}
	</form>
{/snippet}

<style>
	/* Dni tygodnia tylko przy „w wybrane dni” – bez skryptu, z :has(). */
	.task .days {
		display: none;
	}
	.task:has(select[name='repeat'] option[value='days']:checked) .days {
		display: flex;
	}
	.kid {
		min-width: 80px;
		color: color-mix(in srgb, var(--c) 70%, var(--fg));
	}
	.pts {
		font: 800 20px var(--font-head);
	}
	.pts small {
		font: 400 13px var(--font-body);
	}
	.neg {
		color: var(--alert);
	}
	td:last-child {
		text-align: right;
		font-weight: 700;
	}
</style>
