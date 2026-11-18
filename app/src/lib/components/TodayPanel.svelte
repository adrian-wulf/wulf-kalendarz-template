<script lang="ts">
	import { onMount } from 'svelte';
	import EventPill from './EventPill.svelte';
	import Avatar from './Avatar.svelte';
	import { possessive } from '#lib/logic/profiles.js';
	import { fmtLongDate, fmtTime, weatherIcon, dayHeader } from '#lib/format.js';
	import { eventsOnDay } from '#lib/logic/events.js';
	import type { CalEvent, Dashboard } from '#lib/types.js';
	import { getLang, t, tn } from '#lib/i18n/index.js';
	import { hold } from '#lib/kiosk/hold.js';

	/**
	 * Zegar, pogoda i plan dnia. `variant`: default (kolumna obok tygodnia), strip (pasek u góry –
	 * układ „Tydzień”), portrait (szeroki nagłówek ekranu pionowego), small (mały ekran).
	 */
	let {
		data,
		frozen,
		variant = 'default',
		onevent,
		onsettings,
		onadd
	}: {
		data: Dashboard;
		frozen: boolean;
		variant?: 'default' | 'strip' | 'portrait' | 'small';
		onevent: (e: CalEvent) => void;
		/** --- p4: security --- przytrzymanie zegara 2 s → ustawienia kiosku (za PIN-em) */
		onsettings?: () => void;
		/** --- 26b: guides --- pusty kalendarz: przycisk „Dodaj wydarzenie” */
		onadd?: () => void;
	} = $props();
	// --- 26b: guides --- bez Google i bez żadnego wydarzenia – podpowiedź, jak zacząć
	const calendarEmpty = $derived(!('google' in data.sources) && !data.events.some((e) => e.kind === 'event'));

	let tick = $state<Date | null>(null);
	const now = $derived(tick ?? new Date(data.now));
	onMount(() => {
		if (frozen) return;
		const t = setInterval(() => (tick = new Date()), 1000);
		return () => clearInterval(t);
	});

	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const todayAll = $derived(eventsOnDay(data.events, data.today));
	const ferien = $derived(todayAll.find((e) => e.kind === 'ferien'));
	const today = $derived(todayAll.filter((e) => e.kind !== 'ferien'));

	// Urodziny: dzisiejsze są wydarzeniem na liście „Dziś”, tu odliczanie do najbliższych – jedna linia,
	// żeby plan dnia nie tracił miejsca (na szerokim ekranie pionowym dwie).
	const bd = $derived(data.modules.birthdays);
	const countdown = $derived(
		(bd?.upcoming ?? [])
			.filter((u) => u.days > 0)
			.slice(0, variant === 'portrait' ? 2 : 1)
			.flatMap((u) => {
				const m = memberById.get(u.memberId);
				if (!m) return [];
				const who = possessive(m.name, getLang());
				return [{ m, text: u.days === 1 ? t('p3a.birthdays.tomorrow', { who }) : tn('p3a.birthdays.inDays', u.days, { who }) }];
			})
	);
	const nameday = $derived(bd?.namedays ?? null);
	const celebrating = $derived((nameday?.members ?? []).map((id) => memberById.get(id)).filter((m) => !!m));
</script>

<section class="card today {variant}">
	<div class="top">
	{#if onsettings}
		<div class="clock" data-testid="clock" use:hold={{ ms: 2000, onDone: onsettings }}>{fmtTime(now)}</div>
	{:else}
		<div class="clock">{fmtTime(now)}</div>
	{/if}
	<div class="side">
	<div class="date">{fmtLongDate(now)}</div>

	{#if data.modules.holidays?.today}
		<div class="holiday">{data.modules.holidays.today} · {t('kiosk.shopsClosed')}</div>
	{/if}

	{#if ferien}
		<div class="ferientag">🏖 {ferien.title}</div>
	{/if}

	{#if countdown.length || nameday}
		<div class="celebrate">
			{#each countdown as c (c.m.id)}
				<div class="bday" style:--c={c.m.color} data-testid="birthday-countdown"><span class="ico" aria-hidden="true">🎂</span><Avatar member={c.m} size={1.15} /> <span>{c.text}</span></div>
			{/each}
			{#if nameday}
				<div class="nameday" data-testid="namedays">
					<span>{t('p3a.namedays.today', { names: nameday.names.join(', ') })}</span>
					{#each celebrating as m (m.id)}
						<span class="feted" style:--c={m.color} title={t('p3a.namedays.celebrates', { name: m.name })}><Avatar member={m} size={1.05} dot /> {m.name} 💐</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if data.modules.weather}
		{@const weather = data.modules.weather}
		<div class="weather">
			<span class="now">{weatherIcon(weather.now.code)} {Math.round(weather.now.temp)}°</span>
			<span class="next">
				{#each weather.days.slice(1, 4) as d (d.date)}
					<span>{dayHeader(d.date).wd} {weatherIcon(d.code)} {Math.round(d.max)}°</span>
				{/each}
			</span>
		</div>
	{/if}

	{#if data.googleReauth}
		<div class="reauth">⚠ {t('kiosk.googleReauth')}</div>
	{/if}
	{#if data.offlineSince}
		<div class="offline">⚠ {t('kiosk.offline', { time: fmtTime(data.offlineSince) })}</div>
	{/if}
	</div>
	</div>

	<h2>{t('common.today')}</h2>
	<div class="list">
		{#each today as e (e.id)}
			<EventPill event={e} member={e.memberId ? memberById.get(e.memberId) : undefined} big onclick={() => onevent(e)} />
		{:else}
			<p class="empty">{t('kiosk.nothingPlanned')} 🌿</p>
			{#if calendarEmpty && onadd && !frozen}
				<div class="start" data-testid="calendar-empty">
					<p>{t('empty.kiosk.text')}</p>
					<button type="button" onclick={onadd}>+ {t('empty.kiosk.add')}</button>
				</div>
			{/if}
		{/each}
	</div>
</section>

<style>
	.card {
		background: var(--card);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.today {
		padding: 28px 30px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}
	/* Przytrzymanie: zegar lekko blednie – jedyna wskazówka, że coś się dzieje. */
	.clock:global(.holding) {
		opacity: calc(1 - var(--hold, 0) * 0.55);
	}
	.clock {
		font-family: var(--font-head);
		font-size: 150px;
		font-weight: 800;
		line-height: 0.95;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}
	.date {
		font-family: var(--font-head);
		font-size: 36px;
		font-weight: 600;
	}
	.holiday {
		align-self: flex-start;
		background: var(--alert);
		color: #fff;
		border-radius: 999px;
		padding: 6px 18px;
		font-size: 22px;
		font-weight: 700;
	}
	.ferientag {
		font-size: 22px;
		font-weight: 600;
		color: var(--muted);
	}
	.weather {
		display: flex;
		align-items: baseline;
		gap: 18px;
		margin-top: 4px;
	}
	.weather .now {
		font-size: 44px;
		font-weight: 700;
	}
	.weather .next {
		display: flex;
		gap: 16px;
		font-size: 22px;
		color: var(--muted);
	}
	.celebrate {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 22px;
		line-height: 1.25;
	}
	.bday {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 650;
	}
	.bday .ico {
		flex: none;
	}
	.nameday {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		color: var(--muted);
	}
	.feted {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 12px 2px 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--c) 18%, var(--card));
		color: var(--fg);
		font-weight: 650;
	}
	.reauth {
		align-self: flex-start;
		background: #f5c400;
		color: #2a2522;
		border-radius: 999px;
		padding: 4px 14px;
		font-size: 19px;
		font-weight: 700;
	}
	.offline {
		align-self: flex-start;
		background: var(--event-bg);
		color: var(--muted);
		border: 2px dashed var(--muted);
		border-radius: 999px;
		padding: 4px 14px;
		font-size: 19px;
		font-weight: 600;
	}
	h2 {
		font-family: var(--font-head);
		font-size: 20px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 14px 0 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow: hidden;
		min-height: 0;
	}
	/* Za dużo na dziś: ostatnie znikają w całości zamiast ściskać się do połowy wysokości. */
	.list > :global(*) {
		flex-shrink: 0;
	}
	/* Ucięty ostatni wpis wygasa, zamiast urywać się w pół tekstu. */
	.list {
		-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent);
		mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent);
	}
	/* --- 26b: guides --- */
	.start {
		display: grid;
		gap: 10px;
		justify-items: start;
		margin-top: 8px;
		max-width: 34ch;
	}
	.start p {
		margin: 0;
		color: var(--muted);
		font-size: 19px;
		line-height: 1.35;
	}
	.start button {
		font: 700 22px var(--font-body);
		padding: 14px 24px;
		min-height: 56px;
		border-radius: 12px;
		border: 2px solid var(--fg);
		background: transparent;
		color: var(--fg);
		cursor: pointer;
	}
	.empty {
		font-size: 26px;
		color: var(--muted);
		margin: 0;
	}
	/* W układzie domyślnym opakowania nie zmieniają niczego. */
	.top,
	.side {
		display: contents;
	}

	/* --- Pasek u góry (układ „Tydzień”) --- */
	.strip {
		flex-direction: row;
		align-items: center;
		gap: 36px;
		padding: 18px 30px;
	}
	.strip .top {
		display: flex;
		align-items: center;
		gap: 30px;
		flex: none;
	}
	.strip .side {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.strip .clock {
		font-size: 118px;
	}
	.strip .date {
		font-size: 34px;
		white-space: nowrap;
	}
	.strip .weather {
		margin: 0;
	}
	.strip .weather .now {
		font-size: 38px;
	}
	.strip h2 {
		display: none;
	}
	.strip .list {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		border-left: 1px solid var(--line);
		padding-left: 30px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: min-content;
		align-content: center;
		gap: 10px 14px;
	}
	.strip .list :global(.pill.big) {
		font-size: 26px;
		padding: 8px 14px;
	}
	.strip .list :global(.pill .text) {
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}

	/* --- Ekran pionowy: zegar obok daty i pogody, plan dnia pod spodem --- */
	.portrait .top {
		display: flex;
		align-items: center;
		gap: 34px;
	}
	.portrait .side {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
	}
	.portrait .clock {
		font-size: 160px;
	}
	.portrait .date {
		font-size: 38px;
	}
	.portrait .weather {
		margin: 0;
	}
	.portrait h2 {
		margin-top: 10px;
	}
	.portrait .list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: min-content;
		gap: 10px 14px;
	}

	/* --- Mały ekran --- */
	.small {
		padding: 20px 22px;
		gap: 8px;
	}
	.small .clock {
		font-size: 96px;
	}
	.small .date {
		font-size: 26px;
	}
	.small .weather {
		gap: 12px;
		margin: 0;
		flex-wrap: wrap;
	}
	.small .weather .now {
		font-size: 32px;
	}
	.small .weather .next {
		gap: 10px;
		font-size: 20px;
	}
	.small h2 {
		margin-top: 8px;
		font-size: 18px;
	}
	.small .list {
		gap: 8px;
	}
	.small .list :global(.pill.big) {
		font-size: 23px;
		padding: 7px 11px;
		border-left-width: 7px;
	}
	.small .celebrate {
		font-size: 19px;
	}
	.strip .celebrate {
		font-size: 20px;
		gap: 4px;
	}
	.small .empty {
		font-size: 22px;
	}
</style>
