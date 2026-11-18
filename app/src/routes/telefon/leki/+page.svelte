<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { me } from '#lib/phone/me.svelte.js';
	import type { Dose } from '#lib/logic/meds.js';
	import { fmtShortDate, fmtTime } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Najpierw moje (wybrany domownik) i wspólne, potem reszta.
	let all = $state(false);
	const doses = $derived(data.doses.filter((d) => all || !me.id || !d.memberId || d.memberId === me.id));
	const who = (id: string | null) => data.members.find((m) => m.id === id);
	const key = (d: Dose) => `${d.medId}:${d.date}:${d.time}`;

	async function take(d: Dose) {
		try {
			const row = await api<{ id: number }>('/api/meds/take', 'POST', { medId: d.medId, date: d.date, time: d.time });
			await invalidateAll();
			say(`💊 ${d.name} · ${t('meds.taken')}`, {
				ms: 8000,
				undo: async () => {
					await api('/api/meds/untake', 'POST', { id: row.id });
					await invalidateAll();
					say(t('phone.undone'));
				}
			});
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}
</script>

<div class="ph-row filter">
	<span class="ph-label">{t('meds.today')}</span>
	{#if me.id}<button type="button" class="chip" class:on={all} onclick={() => (all = !all)}>{t('meds.showAll')}</button>{/if}
</div>

{#each doses as d (key(d))}
	<div class="dose {d.state}">
		<span class="time">{d.time}</span>
		<span class="what"
			><b>{d.name}</b> <span class="ph-muted">{d.dose}</span>
			<small style:--c={who(d.memberId)?.color ?? 'var(--muted)'}>{who(d.memberId)?.name ?? t('common.family')}{#if d.date !== data.today} · {t('time.yesterday')}{/if}</small>{#if d.state === 'overdue'}<em> · {t('meds.overdue')}</em>{/if}</span
		>
		{#if d.state === 'taken'}
			<span class="ok">✓ {d.takenAt ? fmtTime(d.takenAt) : ''}</span>
		{:else}
			<button type="button" class="ph-btn" class:primary={d.state !== 'upcoming'} onclick={() => take(d)}>✓ {t('meds.taken')}</button>
		{/if}
	</div>
{:else}
	<p class="ph-muted">{t('meds.none')}</p>
	<!-- --- 26b: guides --- pusty stan: administrator może od razu przejść do panelu -->
	{#if page.data.isAdmin}<p><a class="ph-btn" href="/admin/leki" data-sveltekit-reload>{t('empty.phone.panel')} ›</a></p>{/if}
{/each}

<div class="ph-label hist">{t('meds.history')}</div>
{#each data.meds.filter((m) => all || !me.id || !m.memberId || m.memberId === me.id) as m (m.id)}
	<div class="hrow">
		<b>{m.name}</b>
		<span class="days">
			{#each m.history.slice(0, 7) as h (h.date)}
				<span class="day" class:full={h.taken >= h.planned} class:miss={h.taken < h.planned} title={fmtShortDate(h.date)}>{h.taken}/{h.planned}</span>
			{/each}
		</span>
	</div>
{/each}
<p class="ph-muted small">{t('meds.privacy')}</p>

<style>
	.filter {
		justify-content: space-between;
		align-items: center;
	}
	.chip {
		border: 2px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--fg);
		padding: 6px 12px;
		font: 600 14px var(--font-body);
	}
	.chip.on {
		border-color: var(--fg);
	}
	.dose {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--card);
		border-radius: 14px;
		padding: 10px 12px;
		margin-bottom: 8px;
		box-shadow: var(--shadow);
	}
	.dose.overdue {
		outline: 2px solid var(--alert);
	}
	.dose.taken,
	.dose.upcoming {
		opacity: 0.7;
	}
	.time {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.what small {
		display: block;
		font-weight: 650;
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
	.what em {
		font-style: normal;
		color: var(--alert);
	}
	.ok {
		color: #22a447;
		font-weight: 700;
	}
	.hist {
		margin-top: 18px;
	}
	.hrow {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		align-items: center;
		margin-bottom: 8px;
	}
	.days {
		display: flex;
		gap: 4px;
	}
	.day {
		font-size: 12px;
		padding: 2px 5px;
		border-radius: 6px;
		background: var(--line);
	}
	.day.full {
		background: color-mix(in srgb, #22a447 30%, var(--card));
	}
	.day.miss {
		background: color-mix(in srgb, var(--alert) 25%, var(--card));
	}
	.small {
		font-size: 13px;
		margin-top: 16px;
	}
</style>
