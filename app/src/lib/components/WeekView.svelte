<script lang="ts">
	import EventPill from './EventPill.svelte';
	import { dayHeader, fmtRange } from '#lib/format.js';
	import { addDays } from '#lib/logic/dates.js';
	import { eventsOnDay } from '#lib/logic/events.js';
	import { holidayOn } from '#lib/logic/holidays.js';
	import type { CalEvent, Dashboard } from '#lib/types.js';
	import { kioskLaunchers } from '#lib/modules/index.js';
	import { t } from '#lib/i18n/index.js';

	/**
	 * Kolejne dni od jutra. `variant`: default (kolumny obok panelu dziś), wide (pełna szerokość),
	 * rows (dni w wierszach – ekran pionowy), small (mały ekran). `nav`: float – przyciski w rogu
	 * nad dniami, bar – pasek z zakresem dat nad dniami. `max` – ile wydarzeń w dniu, reszta jako „+N”.
	 */
	let {
		data,
		offset = $bindable(0),
		count = 7,
		variant = 'default',
		nav = 'float',
		max = Infinity,
		onday,
		onevent,
		onadd,
		oncalendars
	}: {
		data: Dashboard;
		offset?: number;
		count?: number;
		variant?: 'default' | 'wide' | 'rows' | 'small';
		nav?: 'float' | 'bar';
		max?: number;
		onday: (d: string) => void;
		onevent: (e: CalEvent, d: string) => void;
		onadd: () => void;
		/** „Kalendarze” – szybkie ukrywanie warstw (26a) */
		oncalendars?: () => void;
	} = $props();

	// Dane sięgają 5 tygodni naprzód (dashboard: DAYS_AHEAD).
	const MAX_OFFSET = $derived(Math.floor(35 / count) - 1);

	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const launchers = $derived(kioskLaunchers(data.enabled));
	const showHolidays = $derived(data.publicHolidays);
	const hiddenLayers = $derived(data.calendars.list.filter((l) => l.hiddenToday).length);
	const ferienIcon = $derived(data.calendars.list.find((l) => l.id === 'ferien')?.icon ?? '🏖');
	const days = $derived(Array.from({ length: count }, (_, i) => addDays(data.today, i + 1 + offset * count)));
</script>

<section class="card week {variant}" class:bar={nav === 'bar'} style:--count={count}>
	{#if nav === 'bar'}
		<header class="range">
			<span>{fmtRange(days[0], days[days.length - 1])}</span>
			{@render buttons()}
		</header>
	{:else}
		{@render buttons()}
	{/if}
	{#each days as d (d)}
		{@const h = dayHeader(d)}
		{@const hol = showHolidays ? holidayOn(d) : undefined}
		{@const evs = eventsOnDay(data.events, d)}
		{@const list = evs.filter((e) => e.kind !== 'ferien')}
		{@const shown = list.length > max ? list.slice(0, max - 1) : list}
		<div class="day" class:weekend={h.weekend}>
			<div class="head" class:hol={!!hol} role="button" tabindex="-1" onclick={() => onday(d)} onkeydown={() => {}}>
				<span class="wd">{h.wd}</span>
				<span class="num">{h.day}</span>
			</div>
			{#if hol}<div class="holname">{hol.name}</div>{/if}
			{#each evs.filter((e) => e.kind === 'ferien') as f (f.id)}<div class="ferien">{ferienIcon ? `${ferienIcon} ` : ''}{f.title}</div>{/each}
			<div class="list">
				{#each shown as e (e.id)}
					<EventPill event={e} member={e.memberId ? memberById.get(e.memberId) : undefined} onclick={() => onevent(e, d)} />
				{/each}
				{#if shown.length < list.length}
					<button type="button" class="more" onclick={() => onday(d)}>{t('common.more', { n: list.length - shown.length })}</button>
				{/if}
			</div>
		</div>
	{/each}
</section>

{#snippet buttons()}
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
		{#if launchers.length || oncalendars}<span class="gap"></span>{/if}
		<button type="button" class="navbtn" disabled={offset === 0} aria-label={t('kiosk.prevWeek')} onclick={() => (offset = Math.max(0, offset - 1))}>‹</button>
		{#if offset > 0}<button type="button" class="navbtn today" onclick={() => (offset = 0)}>{t('common.today')}</button>{/if}
		<button type="button" class="navbtn" disabled={offset >= MAX_OFFSET} aria-label={t('kiosk.nextWeek')} onclick={() => (offset = Math.min(MAX_OFFSET, offset + 1))}>›</button>
		<button type="button" class="navbtn add" onclick={onadd}>{t('common.add')}</button>
	</div>
{/snippet}

<style>
	.card {
		background: var(--card);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.week {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--count), 1fr);
		padding: 18px 10px;
		min-height: 0;
	}
	.nav {
		position: absolute;
		right: 16px;
		bottom: 16px;
		display: flex;
		gap: 12px;
		z-index: 2;
	}
	.navbtn {
		min-width: 84px;
		height: 76px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 700 44px var(--font-body);
		box-shadow: var(--shadow);
	}
	.navbtn.launcher {
		position: relative;
		display: grid;
		place-items: center;
		text-decoration: none;
		font-size: 40px;
	}
	.gap {
		width: 12px;
	}
	.badge {
		position: absolute;
		top: -14px;
		right: -14px;
		min-width: 38px;
		height: 38px;
		padding: 0 8px;
		border-radius: 999px;
		background: #e8590c;
		color: #fff;
		font: 800 24px/38px var(--font-body);
		box-shadow: 0 0 0 3px var(--card);
	}
	.badge.warn {
		background: var(--alert);
	}
	.navbtn.layersbtn {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 20px 0 16px;
		font-size: 26px;
	}
	.dots {
		display: flex;
	}
	.dots i {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 0 3px var(--card);
	}
	.dots i + i {
		margin-left: -7px;
	}
	/* Wąskie układy (mały ekran, pionowy): same kropki – nazwa jest w etykiecie przycisku. */
	.small .navbtn.layersbtn,
	.rows .navbtn.layersbtn {
		min-width: 0;
		padding: 0 12px;
		justify-content: center;
	}
	.rows .gap {
		width: 0;
	}
	.rows .nav {
		gap: 8px;
	}
	.small .layersbtn .lbl,
	.rows .layersbtn .lbl {
		display: none;
	}
	.navbtn:disabled {
		opacity: 0.3;
	}
	.navbtn.today,
	.navbtn.add {
		white-space: nowrap;
		font-size: 28px;
		padding: 0 22px;
	}
	.navbtn.add {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.day {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 8px;
		min-width: 0;
		min-height: 0;
		border-left: 1px solid var(--line);
	}
	.day:first-child {
		border-left: none;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 0 4px 6px;
	}
	.wd {
		font-family: var(--font-head);
		font-size: 22px;
		font-weight: 600;
		color: var(--muted);
	}
	.num {
		font-family: var(--font-head);
		font-size: 40px;
		font-weight: 800;
	}
	.weekend .wd,
	.hol .wd,
	.hol .num {
		color: var(--alert);
	}
	.holname {
		font-size: 17px;
		color: var(--alert);
		font-weight: 600;
		margin-top: -8px;
		padding: 0 4px;
	}
	.ferien {
		font-size: 16px;
		font-weight: 600;
		color: var(--muted);
		margin-top: -6px;
		padding: 0 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow: hidden;
		/* lista wypełnia kolumnę; gdy wydarzeń jest za dużo, ostatnie łagodnie znika zamiast być ucięte */
		flex: 1 1 auto;
		min-height: 0;
		mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
	}
	.list :global(.pill) {
		font-size: 20px;
		/* przy braku miejsca lista ucina ostatnie wydarzenie – wydarzenia nie kurczą się do połowy linii */
		flex: none;
	}
	/* --- „+N więcej” (gdy dzień ma limit wydarzeń) --- */
	.more {
		align-self: flex-start;
		border: 2px dashed var(--line);
		background: none;
		color: var(--muted);
		border-radius: var(--radius-s);
		font: 650 22px var(--font-body);
		padding: 6px 12px;
	}

	/* --- Pasek z zakresem dat i przyciskami nad dniami --- */
	.week.bar {
		grid-template-rows: auto minmax(0, 1fr);
		padding-top: 14px;
	}
	.range {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 8px 14px 12px;
		margin-bottom: 14px;
		border-bottom: 1px solid var(--line);
	}
	.range > span {
		font-family: var(--font-head);
		font-size: 34px;
		font-weight: 700;
		margin-right: auto;
		white-space: nowrap;
	}
	.bar .nav {
		position: static;
	}
	.bar .day:nth-child(2) {
		border-left: none;
	}

	/* --- Pełna szerokość (układ „Tydzień”) --- */
	.wide .day {
		padding: 0 12px;
		gap: 10px;
	}
	.wide .wd {
		font-size: 26px;
	}
	.wide .num {
		font-size: 50px;
	}
	.wide .list {
		gap: 10px;
	}
	.wide .list :global(.pill) {
		font-size: 24px;
		padding: 9px 12px;
	}
	.wide .holname,
	.wide .ferien {
		font-size: 20px;
	}

	/* --- Mały ekran --- */
	.small {
		padding: 12px 6px;
	}
	.small.bar {
		padding-top: 10px;
	}
	.small .range {
		padding: 0 4px 10px 10px;
		margin-bottom: 10px;
	}
	.small .range > span {
		font-size: 26px;
	}
	.small .nav {
		gap: 8px;
	}
	.small .navbtn {
		min-width: 64px;
		height: 58px;
		border-radius: 14px;
		font-size: 34px;
	}
	.small .navbtn.launcher {
		font-size: 30px;
	}
	.small .navbtn.today,
	.small .navbtn.add {
		font-size: 22px;
		padding: 0 16px;
	}
	.small .gap {
		width: 4px;
	}
	.small .badge {
		top: -10px;
		right: -10px;
		min-width: 30px;
		height: 30px;
		font-size: 19px;
		line-height: 30px;
	}
	.small .day {
		padding: 0 7px;
		gap: 7px;
	}
	.small .head {
		padding-bottom: 2px;
	}
	.small .num {
		font-size: 34px;
	}
	.small .wd {
		font-size: 20px;
	}
	.small .list {
		gap: 7px;
	}
	.small .list :global(.pill) {
		font-size: 22px;
		padding: 6px 9px;
	}

	/* --- Dni w wierszach (ekran pionowy) --- */
	.week.rows {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto repeat(var(--count), minmax(0, 1fr));
		padding: 14px 18px 8px;
	}
	.rows .range {
		margin-bottom: 0;
		padding-left: 4px;
	}
	.rows .day {
		/* niskie wiersze (pionowy ekran z wieloma kafelkami) – wydarzenia w jednej linii, nic nie wchodzi na sąsiedni dzień */
		container-type: size;
		overflow: hidden;
		display: grid;
		grid-template-columns: 132px minmax(0, 1fr);
		grid-auto-rows: min-content;
		align-content: center;
		column-gap: 16px;
		row-gap: 2px;
		padding: 10px 0;
		border-left: none;
		border-top: 1px solid var(--line);
	}
	.rows .range + .day {
		border-top: none;
	}
	.rows .head {
		grid-column: 1;
		padding: 0;
		gap: 10px;
	}
	.rows .wd {
		font-size: 26px;
	}
	.rows .num {
		font-size: 46px;
	}
	.rows .holname,
	.rows .ferien {
		grid-column: 1;
		margin: 0;
		padding: 0;
		font-size: 17px;
		white-space: normal;
	}
	.rows .list {
		mask-image: none;
		grid-column: 2;
		grid-row: 1 / span 3;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-content: center;
		gap: 10px;
	}
	.rows .list :global(.pill) {
		font-size: 23px;
	}
	.rows .more {
		align-self: stretch;
	}
	@container (max-height: 84px) {
		.rows .list :global(.pill) {
			flex-direction: row;
			align-items: baseline;
			gap: 8px;
			padding-block: 4px;
			font-size: 22px;
		}
		.rows .list :global(.pill .text) {
			-webkit-line-clamp: 1;
			line-clamp: 1;
			word-break: break-all;
		}
		.rows .list :global(.pill .meta) {
			flex: none;
		}
		.rows .more {
			padding: 2px 10px;
			font-size: 19px;
		}
	}
</style>
