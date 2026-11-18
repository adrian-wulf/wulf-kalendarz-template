<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { updated } from '$app/state';
	import { page } from '$app/state';
	import Stage from '#lib/components/Stage.svelte';
	import { kioskBody } from '#lib/kiosk/mode.js';
	import TodayPanel from '#lib/components/TodayPanel.svelte';
	import WeekView from '#lib/components/WeekView.svelte';
	import MonthView from '#lib/components/MonthView.svelte';
	import Tiles from '#lib/components/Tiles.svelte';
	import AddFlow from '#lib/components/kiosk/AddFlow.svelte';
	import DaySheet from '#lib/components/kiosk/DaySheet.svelte';
	import ListSheet from '#lib/components/kiosk/ListSheet.svelte';
	import Screensaver from '#lib/components/kiosk/Screensaver.svelte';
	import type { CalEvent, FlowKind, RemoveKind } from '#lib/types.js';
	import { kioskTiles } from '#lib/modules/index.js';
	import { layoutFromQuery, presetOf } from '#lib/layout.js';
	import { t } from '#lib/i18n/index.js';
	import type { TileKind } from '#lib/modules/types.js';
	// --- p3b: meals, kids, countdown ---
	import MealsSheet from '#lib/modules/meals/KioskSheet.svelte';
	import KidsSheet from '#lib/modules/kids/KioskSheet.svelte';
	import CountdownSheet from '#lib/modules/countdown/KioskSheet.svelte';
	// --- p4: security ---
	import KioskSettings from '#lib/components/kiosk/KioskSettings.svelte';
	import { needPin } from '#lib/kiosk/pin.svelte.js';
	// --- 26a: calendar layers ---
	import LayersSheet from '#lib/components/kiosk/LayersSheet.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const dash = $derived(data.dashboard);
	const frozen = $derived(page.url.searchParams.has('at'));
	// Układ z panelu; podgląd w panelu nadpisuje go adresem (?layout=…&res=…&density=…).
	const layout = $derived(layoutFromQuery(data.layout, page.url.searchParams));
	const preset = $derived(presetOf(layout.preset)!);
	// Kafelki aktywnych modułów; szerokość kolumny z manifestu (zakupy trochę szersze).
	const tiles = $derived(kioskTiles(dash.enabled).map((m) => m.kiosk!.tile!));
	// Kafelki w rzędach. Jeden rząd mieści `perRow` kafelków (zależnie od szerokości układu); więcej →
	// kilka rzędów po najwyżej `maxCols` kafelków (przy wszystkich modułach: 2 rzędy, w pionie 3).
	const perRow = $derived(layout.preset === 'portrait' ? 3 : layout.preset === 'small' ? 4 : 5);
	const maxCols = $derived(layout.preset === 'portrait' ? 4 : 5);
	const tileRows = $derived(tiles.length <= perRow ? 1 : Math.max(2, Math.ceil(tiles.length / maxCols)));
	const tileGrid = $derived(rowGrid(tiles.length, tileRows));
	const tileColumns = $derived(tileRows > 1 ? `repeat(${tileGrid.columns}, minmax(0, 1fr))` : tiles.map((t) => `${t.weight ?? 1}fr`).join(' '));

	/**
	 * Kafelki po równo w rzędach, bez dziur na końcu: np. 10 w 3 rzędach → 3 + 3 + 4. Mniejsze rzędy (szersze
	 * kafelki) najpierw – tam są zwykle zakupy, kartki i zadania. Siatka ma NWW długości rzędów kolumn,
	 * a każdy kafelek zajmuje `span` z nich.
	 */
	function rowGrid(n: number, rows: number): { columns: number; spans: number[] } {
		if (rows <= 1) return { columns: n, spans: [] };
		const base = Math.floor(n / rows);
		const sizes = Array.from({ length: rows }, (_, i) => base + (i >= rows - (n % rows) ? 1 : 0));
		const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
		const columns = sizes.reduce((a, b) => (a * b) / gcd(a, b), 1);
		return { columns, spans: sizes.flatMap((len) => Array<number>(len).fill(columns / len)) };
	}

	type ListKind = 'shopping' | 'note' | 'chore';
	type Overlay =
		| { type: 'add'; kind: FlowKind; back?: ListKind }
		| { type: 'list'; kind: ListKind }
		| { type: 'day'; date: string; event: CalEvent | null }
		| { type: 'module'; kind: Exclude<TileKind, ListKind> }
		| { type: 'settings' }
		| { type: 'calendars' }
		| null;
	let overlay = $state<Overlay>(null);
	let weekOffset = $state(0);

	// Usuwanie z możliwością cofnięcia: element znika od razu, zapis po 5 s.
	const UNDO_MS = 5000;
	let hidden = $state(new Set<string>());
	let toast = $state<{ key: string; label: string; error?: boolean } | null>(null);
	const pending = new Map<string, ReturnType<typeof setTimeout>>();

	// DELETE z typem JSON – SvelteKit blokuje „formularzowe” żądania bez niego (ochrona CSRF).
	const JSON_HEADERS = { 'content-type': 'application/json' };
	const ENDPOINT: Record<RemoveKind, (id: string) => [string, RequestInit]> = {
		shopping: (id) => [`/api/shopping/${id}`, { method: 'DELETE', headers: JSON_HEADERS }],
		note: (id) => [`/api/notes/${id}`, { method: 'DELETE', headers: JSON_HEADERS }],
		task: (key) => ['/api/tasks/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }]
	};

	async function remove(kind: RemoveKind, id: string, label: string) {
		// Zdjęcie kartki to usunięcie – po PIN-ie, gdy włączono „PIN przy usuwaniu” (zakupy i zadania – odhaczenie).
		if (kind === 'note' && !(await needPin('delete'))) return;
		const key = `${kind}:${id}`;
		hidden = new Set(hidden).add(key);
		toast = { key, label };
		pending.set(
			key,
			setTimeout(async () => {
				pending.delete(key);
				try {
					const r = await fetch(...ENDPOINT[kind](id));
					// Przywracanie kopii (503) – komunikat zamiast „nie udało się”; pozycja wraca na listę.
					if (r.status === 503) toast = { key, label: t('p4.backup.restoringNow'), error: true };
					else {
						if (!r.ok) throw new Error();
						await invalidateAll();
					}
				} catch {
					toast = { key, label: t('common.failed', { label }), error: true };
				}
				const h = new Set(hidden);
				h.delete(key);
				hidden = h;
				if (toast?.key === key && !toast.error) toast = null;
			}, UNDO_MS)
		);
	}

	function undo() {
		if (!toast) return;
		clearTimeout(pending.get(toast.key));
		pending.delete(toast.key);
		const h = new Set(hidden);
		h.delete(toast.key);
		hidden = h;
		toast = null;
	}

	const openDay = (d: string) => (overlay = { type: 'day', date: d, event: null });
	const openEvent = (e: CalEvent, d: string) => (overlay = { type: 'day', date: d, event: e });
	const openToday = (e: CalEvent) => (overlay = { type: 'day', date: dash.today, event: e });
	const addEvent = () => (overlay = { type: 'add', kind: 'event' });
	// --- 26a: calendar layers --- „Kalendarze”: ukrycie kalendarza do północy.
	const openCalendars = () => (overlay = { type: 'calendars' });
	// Przytrzymanie zegara 2 s: ustawienia kiosku (za PIN-em, gdy ustawiony).
	const openSettings = async () => {
		if (frozen) return;
		if (await needPin('settings')) overlay = { type: 'settings' };
	};
	// Kafelki z własnym oknem (posiłki, dzieci, odliczanie) – reszta ma wspólną listę.
	const openTile = (kind: TileKind) =>
		(overlay = kind === 'shopping' || kind === 'note' || kind === 'chore' ? { type: 'list', kind } : { type: 'module', kind });

	$effect(() => {
		document.documentElement.dataset.phase = dash.phase;
	});

	// Bezczynność: po 60 s bez dotyku zamknij okna i wróć do bieżącego tygodnia.
	const IDLE_MS = 60_000;
	let lastTouch = Date.now();

	onMount(() => {
		if (!frozen) kioskBody();
		const onTouch = () => (lastTouch = Date.now());
		window.addEventListener('pointerdown', onTouch, true);
		const loadedAt = Date.now();
		const idle = setInterval(() => {
			if (Date.now() - lastTouch > IDLE_MS) {
				overlay = null;
				weekOffset = 0;
			}
			// Codziennie o 4:00 świeży start strony po pracy 24/7.
			const four = new Date().setHours(4, 0, 0, 0);
			if (!frozen && !overlay && loadedAt < four && Date.now() >= four) location.reload();
			// Nowa wersja aplikacji po wdrożeniu – przeładowanie, gdy nikt nie dotyka ekranu.
			if (!frozen && !overlay && updated.current && Date.now() - lastTouch > 20_000) location.reload();
		}, 5000);
		const refresh = frozen ? undefined : setInterval(() => !overlay && invalidateAll(), 30_000);
		return () => {
			window.removeEventListener('pointerdown', onTouch, true);
			clearInterval(idle);
			clearInterval(refresh);
		};
	});
</script>

<Stage base={preset.base} resolution={layout.resolution} overlay={overlays}>
	<main class="lay-{layout.preset}" class:compact={layout.density === 'compact'} class:notiles={!tiles.length} class:tworows={tileRows > 1} class:threerows={tileRows > 2} data-layout={layout.preset} data-tile-rows={tileRows}>
		{#if layout.preset === 'week'}
			<TodayPanel data={dash} {frozen} variant="strip" onevent={openToday} onsettings={openSettings} onadd={addEvent} />
			<WeekView data={dash} bind:offset={weekOffset} variant="wide" nav="bar" onday={openDay} onevent={openEvent} onadd={addEvent} oncalendars={openCalendars} />
		{:else if layout.preset === 'month'}
			<div class="top">
				<TodayPanel data={dash} {frozen} onevent={openToday} onsettings={openSettings} onadd={addEvent} />
				<MonthView data={dash} max={layout.density === 'compact' ? 4 : 3} onday={openDay} onadd={addEvent} oncalendars={openCalendars} />
			</div>
		{:else if layout.preset === 'portrait'}
			<TodayPanel data={dash} {frozen} variant="portrait" onevent={openToday} onsettings={openSettings} onadd={addEvent} />
			<WeekView data={dash} bind:offset={weekOffset} variant="rows" nav="bar" max={3} onday={openDay} onevent={openEvent} onadd={addEvent} oncalendars={openCalendars} />
		{:else if layout.preset === 'small'}
			<div class="top">
				<TodayPanel data={dash} {frozen} variant="small" onevent={openToday} onsettings={openSettings} onadd={addEvent} />
				<WeekView data={dash} bind:offset={weekOffset} count={4} variant="small" nav="bar" onday={openDay} onevent={openEvent} onadd={addEvent} oncalendars={openCalendars} />
			</div>
		{:else}
			<div class="top">
				<TodayPanel data={dash} {frozen} onevent={openToday} onsettings={openSettings} onadd={addEvent} />
				<WeekView data={dash} bind:offset={weekOffset} onday={openDay} onevent={openEvent} onadd={addEvent} oncalendars={openCalendars} />
			</div>
		{/if}
		{#if tiles.length}
			<div class="bottom" style:grid-template-columns={tileColumns}>
				<Tiles data={dash} kinds={tiles.map((t) => t.kind)} spans={tileGrid.spans} {hidden} onadd={(kind) => (overlay = { type: 'add', kind })} onremove={remove} onopen={openTile} />
			</div>
		{/if}
	</main>

</Stage>

{#if dash.modules.screensaver}
	<Screensaver config={dash.modules.screensaver} night={dash.phase === 'night'} />
{/if}

<!-- Okna na osobnej warstwie Stage – na wąskim płótnie pomniejszone, nie przycięte. -->
{#snippet overlays()}
	{#if overlay?.type === 'add'}
		{@const back = overlay.back}
		<AddFlow
			kind={overlay.kind}
			members={dash.members}
			today={dash.today}
			onclose={() => (overlay = back ? { type: 'list', kind: back } : null)}
			onsaved={() => invalidateAll()}
		/>
	{:else if overlay?.type === 'list'}
		{@const kind = overlay.kind}
		<ListSheet {kind} data={dash} {hidden} onclose={() => (overlay = null)} onadd={() => (overlay = { type: 'add', kind, back: kind })} onremove={remove} />
	{:else if overlay?.type === 'day'}
		<DaySheet events={dash.events} members={dash.members} date={overlay.date} event={overlay.event} holidays={dash.publicHolidays} onclose={() => (overlay = null)} />
	{:else if overlay?.type === 'module'}
		{#if overlay.kind === 'meal'}
			<MealsSheet data={dash} onclose={() => (overlay = null)} onchanged={() => invalidateAll()} />
		{:else if overlay.kind === 'kids'}
			<KidsSheet onclose={() => (overlay = null)} onchanged={() => invalidateAll()} />
		{:else if overlay.kind === 'countdown'}
			<CountdownSheet data={dash} onclose={() => (overlay = null)} />
		{/if}
	{:else if overlay?.type === 'settings'}
		<KioskSettings onclose={() => (overlay = null)} />
	{:else if overlay?.type === 'calendars'}
		<LayersSheet layers={dash.calendars} members={dash.members} onclose={() => (overlay = null)} onchanged={() => invalidateAll()} />
	{/if}

	{#if toast}
		<div class="toast" class:error={toast.error} transition:fly={{ y: 60, duration: 200 }}>
			<span>{toast.error ? toast.label : `✓ ${toast.label}`}</span>
			{#if !toast.error}<button type="button" onclick={undo}>{t('common.undo')}</button>{:else}<button type="button" onclick={() => (toast = null)}>{t('common.ok')}</button>{/if}
		</div>
	{/if}
{/snippet}

<style>
	/* Odstępy zależne od gęstości (panel → Układ ekranu → Gęstość). */
	main {
		--pad: 22px;
		--gap: 18px;
		--tiles: 300px;
		width: 100%;
		height: 100%;
		padding: var(--pad);
		display: grid;
		grid-template-rows: minmax(0, 1fr) var(--tiles);
		gap: var(--gap);
	}
	main.compact {
		--pad: 14px;
		--gap: 12px;
		--tiles: 260px;
	}
	.top {
		display: grid;
		grid-template-columns: 560px minmax(0, 1fr);
		gap: var(--gap);
		min-height: 0;
	}
	main.notiles {
		grid-template-rows: minmax(0, 1fr);
	}
	.bottom {
		display: grid;
		gap: var(--gap);
		min-height: 0;
	}

	/* Tydzień: pasek „dziś” u góry, dni na całą szerokość */
	main.lay-week {
		--tiles: 270px;
		grid-template-rows: auto minmax(0, 1fr) var(--tiles);
	}
	main.lay-week.compact {
		--tiles: 230px;
	}
	main.lay-week.notiles {
		grid-template-rows: auto minmax(0, 1fr);
	}

	/* Miesiąc: dziś z boku (węższy), niższe kafelki – siatka potrzebuje wysokości */
	main.lay-month {
		--tiles: 230px;
	}
	main.lay-month.compact {
		--tiles: 210px;
	}
	main.lay-month .top {
		grid-template-columns: 500px minmax(0, 1fr);
	}

	/* Pionowy 1080×1920: dziś u góry, dni w wierszach, kafelki na dole */
	main.lay-portrait {
		--tiles: 400px;
		grid-template-rows: auto minmax(0, 1fr) var(--tiles);
	}
	main.lay-portrait.compact {
		--tiles: 360px;
	}
	main.lay-portrait.notiles {
		grid-template-rows: auto minmax(0, 1fr);
	}
	main.lay-portrait > :global(.today) {
		max-height: 560px;
	}

	/* Mały ekran 1280×800 */
	main.lay-small {
		--pad: 14px;
		--gap: 12px;
		--tiles: 240px;
	}
	main.lay-small.compact {
		--pad: 10px;
		--gap: 10px;
		--tiles: 214px;
	}
	main.lay-small .top {
		grid-template-columns: 380px minmax(0, 1fr);
	}
	/* Kilka rzędów kafelków (patrz `tileRows`) – wyższy pas na dole, kalendarz trochę niższy. */
	main.tworows {
		--tiles: 470px !important;
	}
	main.tworows.compact,
	main.tworows.lay-month,
	main.tworows.lay-small {
		--tiles: 420px !important;
	}
	main.tworows.lay-portrait {
		--tiles: 660px !important;
	}
	main.tworows.lay-portrait.compact {
		--tiles: 600px !important;
	}
	main.threerows.lay-portrait {
		--tiles: 900px !important;
	}
	main.threerows.lay-portrait.compact {
		--tiles: 840px !important;
	}
	main.tworows .bottom {
		grid-auto-rows: minmax(0, 1fr);
	}
	/* Niskie rzędy (miesiąc, mały ekran, gęsto): mniejszy nagłówek i odstępy kafelka, żeby treść się zmieściła. */
	main.tworows.compact:not(.lay-portrait),
	main.tworows.lay-month,
	main.tworows.lay-small {
		--tile-head: 44px;
		--tile-pad: 8px 14px 12px;
	}
	.toast {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		background: var(--fg);
		color: var(--card);
		border-radius: 20px;
		font: 600 30px var(--font-body);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
	}
	.toast {
		bottom: 40px;
		display: flex;
		align-items: center;
		gap: 30px;
		padding: 16px 16px 16px 32px;
		max-width: min(1400px, calc(100% - 80px));
	}
	.toast span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.toast.error {
		background: var(--alert);
	}
	.toast button {
		font: 700 30px var(--font-body);
		padding: 16px 30px;
		border-radius: 14px;
		border: none;
		background: var(--card);
		color: var(--fg);
	}
</style>
