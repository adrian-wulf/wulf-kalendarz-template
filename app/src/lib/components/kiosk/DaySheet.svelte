<script lang="ts">
	import Sheet from './Sheet.svelte';
	import EventPill from '../EventPill.svelte';
	import { dayHeader, fmtDayMonth, fmtTime } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import { eventsOnDay, timedSpan } from '#lib/logic/events.js';
	import { holidayOn } from '#lib/logic/holidays.js';
	import type { CalEvent, Member } from '#lib/types.js';
	import { eventColor } from '#lib/calendars.js';

	/** Podgląd jednego dnia albo jednego wydarzenia (bez edycji – ta jest w telefonie i panelu). */
	let {
		events,
		members,
		date,
		event = null,
		holidays = true,
		onclose
	}: { events: CalEvent[]; members: Member[]; date: string; event?: CalEvent | null; holidays?: boolean; onclose: () => void } = $props();

	const byId = $derived(new Map(members.map((m) => [m.id, m])));
	const h = $derived(dayHeader(date));
	const list = $derived(eventsOnDay(events, date));
	const hol = $derived(holidays ? holidayOn(date) : undefined);
	const title = $derived(`${h.wd} ${fmtDayMonth(date)}`);
	// Wydarzenie godzinowe na kilka dni (np. 22:00–06:00): pełny zakres z datami.
	const span = $derived(event && !event.allDay ? timedSpan(event) : null);
	const multi = $derived(!!span && span.first !== span.last);
</script>

<Sheet title={event ? event.title : title} {onclose}>
	{#if event}
		{@const m = event.memberId ? byId.get(event.memberId) : undefined}
		<div class="detail" style:--c={eventColor(event, m)}>
			{#if m}<p class="who">{m.name}</p>{/if}
			<p class="when">
				{#if multi && span}{fmtDayMonth(span.first)}, {fmtTime(event.start)} – {fmtDayMonth(span.last)}, {fmtTime(event.end)}{:else}{title}{#if !event.allDay}, {fmtTime(event.start)}–{fmtTime(event.end)}{:else} · {t('kiosk.allDay')}{/if}{/if}
			</p>
			{#if event.location}<p class="extra">📍 {event.location}</p>{/if}
			{#if event.description}<p class="extra">{event.description}</p>{/if}
			<p class="hint">{t('kiosk.editElsewhere')}</p>
		</div>
	{:else}
		{#if hol}<p class="hol">{hol.name} · {t('kiosk.shopsClosed')}</p>{/if}
		<div class="list">
			{#each list as e (e.id)}
				<EventPill event={e} member={e.memberId ? byId.get(e.memberId) : undefined} big />
			{:else}
				<p class="hint">{t('kiosk.nothingPlanned')} 🌿</p>
			{/each}
		</div>
	{/if}
</Sheet>

<style>
	.detail {
		border-left: 14px solid var(--c);
		padding-left: 30px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.detail p {
		margin: 0;
	}
	.who {
		font: 800 40px var(--font-body);
		color: color-mix(in srgb, var(--c) 75%, var(--fg));
	}
	.when {
		font-size: 40px;
	}
	.extra {
		font-size: 32px;
	}
	.hint {
		font-size: 26px;
		color: var(--muted);
		margin: 30px 0 0;
	}
	.hol {
		color: var(--alert);
		font-size: 30px;
		font-weight: 700;
		margin: 0;
	}
	.list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-content: start;
	}
</style>
