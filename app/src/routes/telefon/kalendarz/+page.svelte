<script lang="ts">
	import Fold from '#lib/components/phone/Fold.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { me } from '#lib/phone/me.svelte.js';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { eventsOnDay } from '#lib/logic/events.js';
	import { holidayOn } from '#lib/logic/holidays.js';
	import { eventColor, eventIcon } from '#lib/calendars.js';
	import { dayHeader, eventTime, fmtDayMonth } from '#lib/format.js';
	import { t, tn } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Najbliższe dwa tygodnie. „Moje kalendarze”: każda osoba wybiera, co widzi na swoim telefonie
	 * (zapis przy osobie; bez wybranej osoby – tylko na tym telefonie).
	 */
	const DEVICE_KEY = 'telefonKalendarzeUkryte';
	function deviceHidden(): string[] {
		try {
			return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '[]');
		} catch {
			return [];
		}
	}
	let override = $state<string[] | null>(null);
	const hidden = $derived(new Set(override ?? (me.id ? (data.hiddenBy[me.id] ?? []) : typeof localStorage === 'undefined' ? [] : deviceHidden())));
	// Zmiana osoby – znowu jej zapis z serwera.
	$effect(() => {
		void me.id;
		override = null;
	});

	const byId = $derived(new Map(data.members.map((m) => [m.id, m])));
	const visible = $derived(data.events.filter((e) => !hidden.has(e.calendarId ?? '')));
	const shownCount = $derived(data.calendars.filter((c) => !hidden.has(c.id)).length);

	async function toggle(id: string) {
		const next = new Set(hidden);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		const list = [...next];
		override = list;
		try {
			if (me.id) await api('/api/calendars/phone', 'POST', { memberId: me.id, hidden: list });
			else localStorage.setItem(DEVICE_KEY, JSON.stringify(list));
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}
	const dayTitle = (d: string, i: number) => (i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : `${dayHeader(d).wd} ${fmtDayMonth(d)}`);
</script>

<Fold id="phone-calendars" title={t('cal.phone.mine')} aside={t('cal.phone.count', { n: shownCount, total: data.calendars.length })}>
	<p class="ph-muted hint">{me.id ? t('cal.phone.hintMember', { name: byId.get(me.id)?.name ?? '' }) : t('cal.phone.hintDevice')}</p>
	<div class="layers" data-testid="phone-layers">
		{#each data.calendars as c (c.id)}
			<button type="button" class="layer" class:off={hidden.has(c.id)} role="switch" aria-checked={!hidden.has(c.id)} style:--c={c.swatch ?? 'var(--accent)'} data-calendar={c.id} onclick={() => toggle(c.id)}>
				<span class="mark" class:dot={!c.icon}>{c.icon}</span>
				<span class="name">{c.name}</span>
				<span class="sw" aria-hidden="true"><span></span></span>
			</button>
		{/each}
	</div>
</Fold>

{#each data.days as d, i (d)}
	{@const list = eventsOnDay(visible, d)}
	{@const hol = data.publicHolidays ? holidayOn(d) : undefined}
	{#if list.length || hol || i < 2}
		<section class="day">
			<h2>{dayTitle(d, i)}{#if hol}<span class="hol"> · {hol.name}</span>{/if}</h2>
			{#each list as e (e.id)}
				{@const m = e.memberId ? byId.get(e.memberId) : undefined}
				<div class="ev" style:--c={eventColor(e, m)} style:--m={m?.color ?? 'var(--muted)'}>
					<span class="time">{eventTime(e) ?? t('kiosk.allDay')}</span>
					<span class="title">{eventIcon(e)}{e.title}</span>
					{#if m && e.kind !== 'birthday'}<span class="who"><Avatar member={m} size={1} /> {m.name}</span>{/if}
				</div>
			{:else}
				<p class="ph-muted none">{t('kiosk.nothingPlanned')}</p>
			{/each}
		</section>
	{/if}
{/each}
{#if !visible.length}<p class="ph-muted">{tn('cal.phone.allHidden', data.calendars.length - shownCount)}</p>{/if}

<style>
	.hint {
		margin: 0 0 10px;
		font-size: 15px;
	}
	.layers {
		display: grid;
		gap: 8px;
	}
	.layer {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 2px solid var(--line);
		border-left: 8px solid var(--c);
		background: var(--card);
		color: var(--fg);
		font: 600 16px var(--font-body);
		text-align: left;
	}
	.layer.off {
		border-left-color: var(--line);
		background: var(--bg);
	}
	.layer.off .name,
	.layer.off .mark {
		opacity: 0.5;
	}
	.mark {
		width: 28px;
		text-align: center;
		font-size: 20px;
	}
	.mark.dot::after {
		content: '';
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--c);
	}
	.name {
		flex: 1;
		min-width: 0;
	}
	.sw {
		position: relative;
		width: 46px;
		height: 26px;
		border-radius: 999px;
		background: #1f8a4c;
		flex: none;
	}
	.sw span {
		position: absolute;
		top: 3px;
		left: 23px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		transition: left 0.15s;
	}
	.layer.off .sw {
		background: var(--line);
	}
	.layer.off .sw span {
		left: 3px;
	}
	.day {
		margin: 18px 0 6px;
	}
	h2 {
		font: 800 19px var(--font-head);
		margin: 0 0 8px;
	}
	.hol {
		color: var(--alert);
		font-weight: 600;
	}
	.ev {
		display: grid;
		grid-template-columns: 74px minmax(0, 1fr);
		gap: 2px 10px;
		background: var(--card);
		border-left: 6px solid var(--c);
		border-radius: 10px;
		padding: 9px 12px;
		margin-bottom: 6px;
		box-shadow: var(--shadow);
	}
	.time {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 14px;
		color: var(--muted);
		grid-row: span 2;
	}
	.title {
		font-size: 16px;
		overflow-wrap: anywhere;
	}
	.who {
		font-size: 13px;
		font-weight: 650;
		color: color-mix(in srgb, var(--m) 70%, var(--fg));
	}
	.none {
		margin: 0 0 6px;
		font-size: 15px;
	}
</style>
