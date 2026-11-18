<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Dashboard } from '#lib/types.js';
	import type { P3cTileKind } from '#lib/modules/types.js';
	import type { Dose } from '#lib/logic/meds.js';
	import { careWhen } from '#lib/logic/care.js';
	import { fmtTime } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';

	/**
	 * Kafelki modułów leki, opieka, odjazdy i Home Assistant. Każda zmiana idzie od razu do API
	 * (bez okna dodawania); po „wzięte” / „zrobione” kafelek pokazuje „Cofnij” przez kilka sekund.
	 */
	let { kind, data }: { kind: P3cTileKind; data: Dashboard } = $props();

	const UNDO_MS = 8000;
	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));
	const colorOf = (id: string | null) => (id ? memberById.get(id)?.color : undefined) ?? 'var(--muted)';

	let busy = $state(new Set<string>());
	let undo = $state<{ label: string; run: () => Promise<unknown> } | null>(null);
	let failed = $state<string | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;

	async function post(url: string, body: unknown) {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (r.status === 503) throw new Error(t('p4.backup.restoringNow'));
		if (!r.ok) throw new Error(String(r.status));
		return r.json();
	}

	async function act(key: string, label: string, fn: () => Promise<unknown>, back?: (res: never) => () => Promise<unknown>) {
		if (busy.has(key)) return;
		busy = new Set(busy).add(key);
		failed = null;
		try {
			const res = await fn();
			clearTimeout(undoTimer);
			if (back) {
				const run = back(res as never);
				undo = { label, run };
				undoTimer = setTimeout(() => (undo = null), UNDO_MS);
			}
			await invalidateAll();
		} catch (e) {
			// Przywracanie kopii – zamiast „nie udało się” komunikat, że kalendarz zaraz wróci.
			failed = e instanceof Error && e.message === t('p4.backup.restoringNow') ? e.message : t('common.failed', { label });
		} finally {
			const b = new Set(busy);
			b.delete(key);
			busy = b;
		}
	}

	async function runUndo() {
		const u = undo;
		if (!u) return;
		undo = null;
		clearTimeout(undoTimer);
		try {
			await u.run();
			await invalidateAll();
		} catch {
			failed = t('common.failedShort');
		}
	}

	// --- leki ---
	const meds = $derived(data.modules.meds);
	const RANK = { overdue: 0, due: 1, upcoming: 2, taken: 3 } as const;
	const doses = $derived(meds ? [...meds.doses].sort((a, b) => RANK[a.state] - RANK[b.state] || a.at.localeCompare(b.at)) : []);
	const doseKey = (d: Dose) => `${d.medId}:${d.date}:${d.time}`;
	const take = (d: Dose) =>
		act(doseKey(d), d.name, () => post('/api/meds/take', { medId: d.medId, date: d.date, time: d.time }), (res: { id: number }) => () => post('/api/meds/untake', { id: res.id }));

	// --- opieka ---
	const care = $derived(data.modules.care);
	const done = (id: number, label: string) => act(`care:${id}`, label, () => post('/api/care/done', { id }), (res: { id: number }) => () => post('/api/care/undo', { logId: res.id }));

	// --- odjazdy ---
	const transit = $derived(data.modules.transit);

	// --- Home Assistant ---
	const ha = $derived(data.modules.homeassistant);
	let flipped = $state(new Set<string>());
	async function toggle(id: string, label: string) {
		flipped = new Set(flipped).add(id);
		await act(`ha:${id}`, label, () => post('/api/homeassistant/toggle', { entityId: id }));
		const f = new Set(flipped);
		f.delete(id);
		flipped = f;
	}
	// Obraz z kamery: nowy adres co `cameraSeconds` (serwer pobiera go z HA z tokenem).
	let tick = $state(0);
	onMount(() => {
		if (kind !== 'ha') return;
		const ms = (ha?.cameraSeconds ?? 10) * 1000;
		const id = setInterval(() => document.visibilityState === 'visible' && (tick = Date.now()), ms);
		return () => clearInterval(id);
	});
	let zoom = $state<string | null>(null);
</script>

<div class="mt" data-kind={kind}>
{#if kind === 'meds'}
	<header>
		<h3>💊 {t('module.meds')}{#if meds?.due} <span class="n" class:warn={meds.overdue > 0}>{meds.due}</span>{/if}</h3>
	</header>
	<ul class="list meds">
		{#each doses as d (doseKey(d))}
			<li class="dose {d.state}" style:--c={colorOf(d.memberId)}>
				<span class="time">{d.time}</span>
				<span class="what">
					<b>{d.name}</b>{#if d.dose}<small>{d.dose}</small>{/if}
					<span class="who">{d.memberId ? memberById.get(d.memberId)?.name : t('common.family')}{#if d.date !== data.today} · <em>{t('time.yesterday')}</em>{:else if d.state === 'overdue'} · <em>{t('meds.overdue')}</em>{/if}</span>
				</span>
				{#if d.state === 'due' || d.state === 'overdue'}
					<button type="button" class="take" disabled={busy.has(doseKey(d))} onclick={() => take(d)}>✓ {t('meds.taken')}</button>
				{:else if d.state === 'taken'}
					<span class="ok">✓ {d.takenAt ? fmtTime(d.takenAt) : ''}</span>
				{/if}
			</li>
		{:else}
			<p class="muted">{t('meds.none')}</p>
		{/each}
	</ul>
{:else if kind === 'care'}
	<header>
		<h3>{t('care.tileTitle')}{#if care?.items.length} <span class="n" class:warn={care.overdue > 0}>{care.items.length}</span>{/if}</h3>
	</header>
	<ul class="list care">
		{#each care?.items ?? [] as c (c.id)}
			<li>
				<button type="button" class="careitem {c.state}" disabled={busy.has(`care:${c.id}`)} onclick={() => done(c.id, c.name)} aria-label={t('care.markDone', { name: c.name })}>
					<span class="ic">{c.icon}</span>
					<span class="what"><b>{c.name}</b><span class="when">{careWhen(c, data.today)}</span></span>
					<span class="box" aria-hidden="true"></span>
				</button>
			</li>
		{:else}
			<p class="muted">{t('care.allDone')}</p>
			{#if care?.next}<p class="muted next">{t('care.next', { name: `${care.next.icon} ${care.next.name}`, when: careWhen(care.next, data.today) })}</p>{/if}
		{/each}
	</ul>
{:else if kind === 'transit'}
	<header>
		<h3>🚏 {transit?.stop ?? t('module.transit')}</h3>
		{#if transit && !transit.realtime}<span class="tag">{t('transit.schedule')}</span>{/if}
	</header>
	{#if !transit?.stop}
		<p class="muted">{t('transit.noStop')}</p>
	{:else}
		<ul class="list transit">
			{#each transit.departures as d (d.id)}
				<li class:cancelled={d.cancelled}>
					<span class="line" style:--lc={d.color ?? 'var(--fg)'}>{d.line}</span>
					<span class="dir">{d.direction}</span>
					<span class="mins">
						{#if d.cancelled}<em>{t('transit.cancelled')}</em>{:else if d.minutes !== null && d.minutes <= 0}{t('transit.now')}{:else if d.minutes !== null && d.minutes < 60}{d.minutes}<small> min</small>{:else}{d.time}{/if}
					</span>
					{#if transit.realtime}
						<span class="delay" class:late={(d.delay ?? 0) > 0}>{d.delay === null || d.cancelled ? '' : d.delay > 0 ? `+${d.delay}` : '✓'}</span>
					{/if}
				</li>
			{:else}
				<p class="muted">{transit.error ? t('transit.error') : t('transit.noDepartures')}</p>
			{/each}
		</ul>
	{/if}
{:else if kind === 'ha'}
	<header>
		<h3>🏠 {t('ha.tileTitle')}</h3>
		{#if ha?.error}<span class="tag warn" title={ha.error}>{t('ha.offline')}</span>{/if}
	</header>
	{#if !ha?.configured}
		<p class="muted">{t('ha.notConfigured')}</p>
	{:else}
		<div class="ha" class:withcam={ha.cameras.length > 0}>
			{#if ha.cameras.length}
				<div class="cams">
					{#each ha.cameras.slice(0, 2) as cam (cam.entityId)}
						<button type="button" class="cam" onclick={() => (zoom = cam.entityId)} aria-label={cam.label}>
							<img src="/api/homeassistant/camera/{cam.entityId}?t={tick}" alt={cam.label} />
							<span>{cam.label}</span>
						</button>
					{/each}
				</div>
			{/if}
			<ul class="ents">
				{#each ha.entities as e (e.entityId)}
					{@const on = flipped.has(e.entityId) ? !e.active : e.active}
					<li>
						{#if e.toggle}
							<button type="button" class="ent {e.kind}" class:on aria-pressed={on} disabled={busy.has(`ha:${e.entityId}`)} onclick={() => toggle(e.entityId, e.label)}>
								<span class="ic">{e.icon}</span><span class="lbl">{e.label}</span><span class="st">{on ? t('ha.on') : t('ha.off')}</span>
							</button>
						{:else}
							<div class="ent {e.kind}" class:on class:na={e.unavailable}>
								<span class="ic">{e.icon}</span><span class="lbl">{e.label}</span><span class="st">{e.state}</span>
							</div>
						{/if}
					</li>
				{:else}
					{#if !ha.cameras.length}<p class="muted">{t('ha.noEntities')}</p>{/if}
				{/each}
			</ul>
		</div>
	{/if}
{/if}

{#if undo || failed}
	<div class="undo" class:bad={!!failed} role="status">
		<span>{failed ?? `✓ ${undo?.label}`}</span>
		{#if undo && !failed}<button type="button" onclick={runUndo}>{t('common.undo')}</button>{:else}<button type="button" onclick={() => (failed = null)}>{t('common.ok')}</button>{/if}
	</div>
{/if}

</div>

{#if zoom}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="zoom" onclick={() => (zoom = null)}>
		<img src="/api/homeassistant/camera/{zoom}?t={tick}" alt="" />
	</div>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 10px;
		min-width: 0;
		/* jak w zakupach/kartkach (przycisk „+”) i kafelkach posiłków/dzieci/odliczania – równa linia nagłówków */
		min-height: var(--tile-head, 56px);
	}
	h3 {
		margin: 0;
		font-family: var(--font-head);
		font-size: 20px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.n {
		display: inline-block;
		min-width: 30px;
		padding: 0 8px;
		border-radius: 999px;
		background: var(--line);
		color: var(--fg);
		text-align: center;
		letter-spacing: 0;
	}
	.n.warn {
		background: var(--alert);
		color: var(--card);
	}
	.tag {
		margin-left: auto;
		flex: none;
		font: 600 16px var(--font-body);
		color: var(--muted);
		border: 2px solid var(--line);
		border-radius: 999px;
		padding: 2px 10px;
	}
	.tag.warn {
		color: var(--alert);
		border-color: currentColor;
	}
	.muted {
		color: var(--muted);
		font-size: 24px;
		margin: 0;
	}
	.muted.next {
		margin-top: 8px;
		font-size: 20px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.list > li {
		flex: none;
		min-width: 0;
	}

	/* Leki: pora i zaległe na górze, duży przycisk „Wzięte”. */
	.dose {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 8px 6px 12px;
		border-radius: var(--radius-s);
		border-left: 7px solid var(--c);
		background: var(--event-bg);
		font-size: 22px;
	}
	.dose.due {
		background: color-mix(in srgb, var(--c) 14%, var(--card));
	}
	.dose.overdue {
		background: color-mix(in srgb, var(--alert) 13%, var(--card));
		border-left-color: var(--alert);
	}
	.dose.taken,
	.dose.upcoming {
		opacity: 0.62;
	}
	.time {
		font: 700 22px var(--font-body);
		font-variant-numeric: tabular-nums;
		flex: none;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.what b,
	.what .who,
	.what .when {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.what small {
		font-size: 17px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who {
		font-size: 16px;
		font-weight: 650;
		color: color-mix(in srgb, var(--c) 70%, var(--fg));
	}
	.who em {
		font-style: normal;
		color: var(--alert);
	}
	.take {
		flex: none;
		min-height: 64px;
		padding: 0 20px;
		border-radius: 14px;
		border: none;
		background: #22a447;
		color: #fff;
		font: 700 24px var(--font-body);
		white-space: nowrap;
	}
	.overdue .take {
		background: var(--alert);
	}
	.ok {
		flex: none;
		color: #22a447;
		font-weight: 700;
		font-size: 19px;
	}

	/* Opieka: cała pozycja to przycisk „zrobione”. */
	.careitem {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: var(--radius-s);
		border: none;
		border-left: 7px solid #2f9e44;
		background: var(--event-bg);
		color: var(--fg);
		font: 22px var(--font-body);
		text-align: left;
		min-height: 64px;
	}
	.careitem.overdue {
		border-left-color: var(--alert);
		background: color-mix(in srgb, var(--alert) 10%, var(--card));
	}
	.careitem.overdue .when {
		color: var(--alert);
	}
	.careitem.open {
		border-left-color: #e8a317;
	}
	.careitem .ic {
		font: 30px var(--font-emoji);
		flex: none;
	}
	.when {
		font-size: 17px;
		font-weight: 600;
		color: var(--muted);
	}
	.careitem .box {
		width: 34px;
		height: 34px;
		flex: none;
		border: 3px solid var(--muted);
		border-radius: 10px;
	}
	.careitem:active .box {
		background: #22a447;
		border-color: #22a447;
	}

	/* Odjazdy */
	.transit li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		grid-template-areas: 'line dir mins delay';
		align-items: center;
		gap: 12px;
		font-size: 22px;
		padding: 2px 0;
	}
	.line {
		min-width: 58px;
		padding: 2px 8px;
		border-radius: 8px;
		background: var(--lc);
		color: #fff;
		font: 800 20px var(--font-body);
		text-align: center;
	}
	.dir {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mins {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}
	.mins small {
		font-weight: 600;
		font-size: 16px;
		color: var(--muted);
	}
	.delay {
		min-width: 38px;
		font: 700 17px var(--font-body);
		color: #22a447;
		text-align: right;
	}
	.delay.late {
		color: var(--alert);
	}
	.cancelled .dir,
	.cancelled .line {
		text-decoration: line-through;
		opacity: 0.6;
	}
	.transit .line {
		grid-area: line;
	}
	.transit .dir {
		grid-area: dir;
	}
	.transit .mins {
		grid-area: mins;
	}
	.transit .delay {
		grid-area: delay;
	}
	.cancelled em {
		font-style: normal;
		color: var(--alert);
		font-size: 17px;
	}

	/* Home Assistant */
	.ha {
		display: flex;
		gap: 12px;
		min-height: 0;
	}
	.cams {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 0 0 46%;
		min-width: 0;
	}
	.cam {
		position: relative;
		border: none;
		padding: 0;
		border-radius: var(--radius-s);
		overflow: hidden;
		background: #111;
		aspect-ratio: 16 / 9;
	}
	.cam img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.cam span {
		position: absolute;
		left: 6px;
		bottom: 6px;
		padding: 1px 8px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font: 600 15px var(--font-body);
	}
	.ents {
		flex: 1;
		min-width: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
		align-content: start;
	}
	.ent {
		width: 100%;
		min-height: 64px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: 8px;
		align-items: center;
		padding: 6px 10px;
		border-radius: var(--radius-s);
		border: 2px solid transparent;
		background: var(--event-bg);
		color: var(--fg);
		font: 18px var(--font-body);
		text-align: left;
	}
	.ent .ic {
		grid-row: span 2;
		font: 26px var(--font-emoji);
	}
	.ent .lbl {
		font-size: 16px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ent .st {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ent.on {
		background: color-mix(in srgb, #f4b400 22%, var(--card));
		border-color: color-mix(in srgb, #f4b400 60%, transparent);
	}
	.ent.lock.on,
	.ent.binary_sensor.on {
		background: var(--event-bg);
		border-color: transparent;
	}
	.ent.lock:not(.on) {
		border-color: var(--alert);
	}
	.ent.na {
		opacity: 0.5;
	}
	button.ent {
		cursor: pointer;
	}

	.mt {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.undo {
		position: absolute;
		left: -6px;
		right: -6px;
		top: -6px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 8px 8px 16px;
		border-radius: 14px;
		background: var(--fg);
		color: var(--card);
		font: 600 20px var(--font-body);
		z-index: 2;
	}
	.undo.bad {
		background: var(--alert);
	}
	.undo span {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.undo button {
		flex: none;
		min-height: 52px;
		padding: 0 18px;
		border-radius: 10px;
		border: none;
		background: var(--card);
		color: var(--fg);
		font: 700 20px var(--font-body);
	}
	.zoom {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.88);
		display: grid;
		place-items: center;
	}
	.zoom img {
		max-width: 94%;
		max-height: 94%;
		border-radius: 12px;
	}

	/* Wąski kafelek (pionowy ekran, wiele kafelków) */
	@container (max-width: 420px) {
		h3 {
			font-size: 18px;
			letter-spacing: 0.04em;
		}
		.dose {
			flex-wrap: wrap;
			gap: 4px 10px;
			font-size: 19px;
		}
		.time {
			font-size: 19px;
			align-self: flex-start;
		}
		.what small {
			display: none;
		}
		.dose .what b {
			white-space: normal;
			line-height: 1.1;
		}
		.careitem {
			font-size: 19px;
			gap: 8px;
			padding: 6px 8px;
		}
		.careitem .box {
			display: none;
		}
		.careitem b {
			white-space: normal;
			line-height: 1.1;
		}
		.careitem .ic {
			font-size: 24px;
		}
		.take {
			min-height: 56px;
			width: 100%;
		}
		/* Wąsko: najpierw encje (dwie kolumny), kamera pod nimi – niższa. */
		.ha {
			flex-direction: column-reverse;
			justify-content: flex-end;
		}
		.cams {
			flex: none;
			flex-direction: row;
		}
		.cam {
			flex: 1;
			max-height: 150px;
		}
		.ents {
			flex: none;
			grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		}
		.ent {
			min-height: 56px;
			font-size: 16px;
		}
		.transit li {
			gap: 8px;
			font-size: 20px;
		}
		.line {
			min-width: 46px;
		}
	}
	/* Bardzo wąski kafelek (pionowy ekran z wieloma kafelkami): kierunek w drugiej linii. */
	@container (max-width: 300px) {
		.transit li {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas: 'line mins delay' 'dir dir dir';
			gap: 0 8px;
			padding-bottom: 4px;
		}
		.transit .mins {
			text-align: left;
		}
		.transit .dir {
			font-size: 17px;
			color: var(--muted);
		}
	}
</style>
