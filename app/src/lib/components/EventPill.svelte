<script lang="ts">
	import { eventTime } from '#lib/format.js';
	import Avatar from './Avatar.svelte';
	import type { Member } from '#lib/types.js';
	import type { DayEvent } from '#lib/logic/events.js';
	import { eventColor, eventIcon } from '#lib/calendars.js';

	let { event, member, big = false, onclick }: { event: DayEvent; member?: Member; big?: boolean; onclick?: () => void } = $props();
	const time = $derived(eventTime(event));
	// Trwa od poprzedniego dnia (np. nocna zmiana) – przerywana krawędź.
	const cont = $derived(event.part === 'middle' || event.part === 'last');

	// Pasek: pojemnik > kolor kalendarza > kolor osoby (zasada w `lib/calendars.ts`); imię zawsze w kolorze osoby.
	const color = $derived(eventColor(event, member));
	// Urodziny domownika: tytuł już mówi czyje („Urodziny Oli”) – zamiast imienia sam awatar.
	const bday = $derived(event.kind === 'birthday' && !!member);
	const icon = $derived(eventIcon(event));
</script>

{#if big}
	<div class="pill big" class:bin={event.kind === 'waste'} class:cont data-part={event.part} style:--c={color} style:--m={member?.color ?? color} {onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()} role="button" tabindex="-1">
		{#if time}<b class="time">{time}</b>{/if}
		<span class="text">
			{icon}{#if bday && member}<Avatar {member} size={1.05} />{' '}{:else if member}<span class="who"><Avatar {member} size={1.05} /> {member.name}</span>{' · '}{/if}{event.title}
		</span>
	</div>
{:else}
	<div class="pill compact" class:bin={event.kind === 'waste'} class:cont data-part={event.part} style:--c={color} style:--m={member?.color ?? color} {onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()} role="button" tabindex="-1">
		{#if !event.allDay || (member && !bday)}
			<div class="meta">
				{#if time}<b class="time">{time}</b>{/if}
				{#if member}<span class="who"><Avatar {member} size={1.05} /> {member.name}</span>{/if}
			</div>
		{/if}
		<span class="text">{icon}{event.title}</span>
	</div>
{/if}

<style>
	.pill {
		display: flex;
		gap: 8px;
		align-items: baseline;
		background: var(--event-bg);
		border-left: 7px solid var(--c);
		border-radius: var(--radius-s);
		padding: 7px 10px;
		font-size: 22px;
		line-height: 1.25;
		overflow: hidden;
	}
	.pill.cont {
		border-left-style: dashed;
	}
	.pill.bin {
		background: color-mix(in srgb, var(--c) 16%, var(--card));
	}
	.compact {
		flex-direction: column;
		gap: 1px;
	}
	.meta {
		display: flex;
		gap: 8px;
		align-items: baseline;
		font-size: 0.85em;
	}
	.big {
		font-size: 28px;
		padding: 10px 14px;
		border-left-width: 9px;
	}
	.time {
		font-variant-numeric: tabular-nums;
		flex: none;
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.who {
		font-weight: 650;
		color: color-mix(in srgb, var(--m) 70%, var(--fg));
	}
</style>
