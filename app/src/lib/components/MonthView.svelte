<script lang="ts">
	import { dayHeader, eventTime, fmtMonths, monthShort, weekdaysShort } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import { addDays, isoWeekday } from '#lib/logic/dates.js';
	import { eventsOnDay } from '#lib/logic/events.js';
	import { holidayOn } from '#lib/logic/holidays.js';
	import type { CalEvent, Dashboard } from '#lib/types.js';
	import { kioskLaunchers } from '#lib/modules/index.js';
	import { eventColor, eventIcon } from '#lib/calendars.js';

	/**
	 * Pięć tygodni od poniedziałku bieżącego tygodnia (tyle sięgają dane dashboardu).
	 * Dzień: numer, święto i do `max` krótkich wpisów; dotknięcie dnia otwiera DaySheet.
	 */
	let { data, max = 3, onday, onadd, oncalendars }: { data: Dashboard; max?: number; onday: (d: string) => void; onadd: () => void; oncalendars?: () => void } = $props();

	const WEEKS = 5;
	const WD = weekdaysShort();

	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const launchers = $derived(kioskLaunchers(data.enabled));
	const showHolidays = $derived(data.publicHolidays);
	const hiddenLayers = $derived(data.calendars.list.filter((l) => l.hiddenToday).length);
	const start = $derived(addDays(data.today, 1 - isoWeekday(data.today)));
	const days = $derived(Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i)));

	// Kolor i ikona wg zasady kalendarzy (`lib/calendars.ts`); ferie bez warstwy – jak dotąd 🏖.
	const color = (e: CalEvent) => eventColor(e, e.memberId ? memberById.get(e.memberId) : undefined);
	const icon = (e: CalEvent) => (e.kind === 'ferien' && e.icon === undefined ? '🏖 ' : eventIcon(e));
</script>

<section class="card month">
	<header>
		<h2>{fmtMonths(days[0], days[days.length - 1])}</h2>
		<div class="nav">
			{#each launchers as m (m.id)}
				{@const l = m.kiosk!.launcher!}
				{@const badge = l.badge?.((data.modules as Record<string, never>)[m.id])}
				<a class="navbtn launcher" href={l.href} aria-label={l.label} data-module={m.id} data-sveltekit-reload={l.reload ? '' : undefined}>
					{m.icon}
					{#if badge}<span class="badge" class:warn={badge.warn}>{badge.text}</span>{/if}
				</a>
			{/each}
			{#if oncalendars && data.calendars.list.length}
				<button type="button" class="navbtn layersbtn" onclick={oncalendars} data-testid="layers-button" aria-label={t('cal.kiosk.title')}>
					<span class="dots" aria-hidden="true">{#each data.calendars.list.slice(0, 3) as l (l.id)}<i style:--c={l.swatch ?? 'var(--accent)'}></i>{/each}</span>
					<span class="lbl">{t('cal.kiosk.button')}</span>
					{#if hiddenLayers}<span class="badge" title={t('cal.kiosk.hiddenToday')}>{hiddenLayers}</span>{/if}
				</button>
			{/if}
			<button type="button" class="navbtn add" onclick={onadd}>{t('common.add')}</button>
		</div>
	</header>
	<div class="grid" style:--weeks={WEEKS}>
		{#each WD as wd, i (wd)}<div class="wdname" class:weekend={i > 4}>{wd}</div>{/each}
		{#each days as d (d)}
			{@const h = dayHeader(d)}
			{@const past = d < data.today}
			{@const hol = showHolidays ? holidayOn(d) : undefined}
			{@const evs = past ? [] : eventsOnDay(data.events, d)}
			{@const shown = evs.length > max ? evs.slice(0, max - 1) : evs}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="cell" class:past class:today={d === data.today} class:weekend={h.weekend} class:hol={!!hol} role="button" tabindex="-1" data-date={d} onclick={() => onday(d)}>
				<div class="num">
					{h.day}{#if h.day === 1 || d === days[0]}<small>{monthShort(d)}</small>{/if}
					{#if hol}<span class="holname">{hol.name}</span>{/if}
				</div>
				{#each shown as e (e.id)}
					<div class="ev" style:--c={color(e)}>
						{#if !e.allDay}<b>{eventTime(e)}</b>{/if}<span>{icon(e)}{e.title}</span>
					</div>
				{/each}
				{#if shown.length < evs.length}<div class="more">{t('common.more', { n: evs.length - shown.length })}</div>{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.card {
		background: var(--card);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.month {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		padding: 14px 16px 16px;
		min-height: 0;
		min-width: 0;
	}
	header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 4px 10px 8px;
	}
	h2 {
		margin: 0 auto 0 0;
		font-family: var(--font-head);
		font-size: 36px;
		font-weight: 700;
	}
	.nav {
		display: flex;
		gap: 12px;
	}
	.navbtn {
		min-width: 72px;
		height: 60px;
		border-radius: 16px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 700 36px var(--font-body);
		box-shadow: var(--shadow);
	}
	.navbtn.launcher {
		position: relative;
		display: grid;
		place-items: center;
		text-decoration: none;
	}
	.navbtn.layersbtn {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 16px 0 14px;
		font-size: 24px;
	}
	.dots {
		display: flex;
	}
	.dots i {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 0 3px var(--card);
	}
	.dots i + i {
		margin-left: -6px;
	}
	.navbtn.add {
		font-size: 26px;
		padding: 0 22px;
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.badge {
		position: absolute;
		top: -12px;
		right: -12px;
		min-width: 34px;
		height: 34px;
		padding: 0 7px;
		border-radius: 999px;
		background: #e8590c;
		color: #fff;
		font: 800 21px/34px var(--font-body);
		box-shadow: 0 0 0 3px var(--card);
	}
	.badge.warn {
		background: var(--alert);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		grid-template-rows: auto repeat(var(--weeks), minmax(0, 1fr));
		gap: 6px;
		min-height: 0;
	}
	.wdname {
		font-family: var(--font-head);
		font-size: 22px;
		font-weight: 600;
		color: var(--muted);
		padding: 0 10px 2px;
	}
	.wdname.weekend {
		color: var(--alert);
	}
	.cell {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		padding: 5px 9px 6px;
		border-radius: var(--radius-s);
		background: var(--event-bg);
	}
	.cell.weekend {
		background: color-mix(in srgb, var(--event-bg) 70%, var(--line));
	}
	.cell.past {
		opacity: 0.45;
	}
	.cell.today {
		box-shadow: inset 0 0 0 4px var(--accent);
		background: var(--card);
	}
	.num {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-family: var(--font-head);
		font-size: 26px;
		font-weight: 800;
		line-height: 1.05;
		min-width: 0;
	}
	.num small {
		font-size: 19px;
		font-weight: 600;
		color: var(--muted);
	}
	.weekend .num,
	.hol .num {
		color: var(--alert);
	}
	.holname {
		font: 600 16px var(--font-body);
		color: var(--alert);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.ev {
		display: flex;
		gap: 7px;
		align-items: baseline;
		font-size: 22px;
		line-height: 1.16;
		white-space: nowrap;
		min-width: 0;
		padding-left: 9px;
		border-left: 5px solid var(--c);
	}
	.ev b {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		flex: none;
	}
	.ev span {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.more {
		font-size: 20px;
		line-height: 1.1;
		font-weight: 650;
		color: var(--muted);
		padding-left: 14px;
	}
</style>
