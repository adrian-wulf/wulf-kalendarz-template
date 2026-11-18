<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto, invalidateAll } from '$app/navigation';
	import { updated } from '$app/state';
	import Stage from '#lib/components/Stage.svelte';
	import { kioskBody } from '#lib/kiosk/mode.js';
	import Sheet from '#lib/components/kiosk/Sheet.svelte';
	import DayPicker from '#lib/components/kiosk/DayPicker.svelte';
	import { addDays, daysBetween } from '#lib/logic/dates.js';
	import { agoLabel, feedLine, intervalLabel, type SnakeEventType, type SnakeView } from '#lib/logic/snakes.js';
	import { fmtShortDate } from '#lib/format.js';
	import { inSentence, t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const label = (type: SnakeEventType) => t(`snakes.event.${type}`);
	const legend = $derived(t('snakes.legend').split('|'));
	const ICON: Record<SnakeEventType, string> = { feed: '🍽', refused: '✋', shed: '🐍', clean: '🧽', weight: '⚖️' };
	const SEX = { M: '♂', F: '♀', '?': '' };
	const sx = (s: SnakeView | null) => (s?.sex === 'F' ? 'F' : 'M');
	const short = fmtShortDate;
	const foodLabel = (id: string | null) => data.food.find((f) => f.id === id)?.label ?? '';

	let openId = $state<string | null>(null);
	const open = $derived(data.snakes.find((s) => s.id === openId) ?? null);
	let mode = $state<'main' | 'weight' | 'pause'>('main');
	let food = $state<string | null>(null);
	let grams = $state('');
	let pauseDay = $state('');

	function show(s: SnakeView) {
		openId = s.id;
		mode = 'main';
		food = s.lastFood;
		grams = '';
		pauseDay = s.pauseUntil ?? addDays(data.today, 7);
	}

	let toast = $state<{ text: string; undoId?: number; error?: boolean } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;
	function say(next: typeof toast) {
		toast = next;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 8000);
	}

	const JSON_HEADERS = { 'content-type': 'application/json' };
	async function post(url: string, body: unknown) {
		const r = await fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
		if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? t('common.error'));
		return r.json();
	}

	async function record(type: SnakeEventType) {
		if (!open) return;
		const s = open;
		try {
			const row = await post('/api/snakes/events', { snakeId: s.id, type, food: type === 'feed' ? food : null, grams: type === 'weight' ? Number(grams) : null });
			openId = null;
			await invalidateAll();
			const extra = type === 'feed' && food ? ` (${foodLabel(food)})` : type === 'weight' ? ` ${grams} g` : '';
			say({ text: `${ICON[type]} ${s.name}: ${inSentence(label(type))}${extra}`, undoId: row.id });
		} catch (e) {
			say({ text: t('common.failed', { label: (e as Error).message }), error: true });
		}
	}

	async function undo() {
		if (!toast?.undoId) return;
		const id = toast.undoId;
		toast = null;
		await fetch(`/api/snakes/events/${id}`, { method: 'DELETE', headers: JSON_HEADERS });
		await invalidateAll();
	}

	async function pause(until: string | null) {
		if (!open) return;
		const s = open;
		await post('/api/snakes/pause', { snakeId: s.id, until });
		openId = null;
		await invalidateAll();
		say({ text: until ? `⏸ ${t('snakes.toastPaused', { name: s.name, date: short(until) })}` : `▶ ${t('snakes.toastResumed', { name: s.name })}` });
	}

	async function stock(id: string, delta: 1 | -1) {
		await post('/api/snakes/stock', { food: id, delta });
		await invalidateAll();
	}

	function key(k: string) {
		if (k === '⌫') grams = grams.slice(0, -1);
		else if (grams.length < 5 && !(grams === '' && k === '0')) grams += k;
	}

	// Oś czasu na karcie: 8 tygodni wstecz + 2 tygodnie naprzód.
	const PAST = 56;
	const AHEAD = 14;
	const pos = (date: string) => ((daysBetween(addDays(data.today, -PAST), date) / (PAST + AHEAD)) * 100).toFixed(2);
	const inRange = (date: string) => date >= addDays(data.today, -PAST) && date <= addDays(data.today, AHEAD);


	$effect(() => {
		document.documentElement.dataset.phase = data.phase;
	});

	// Bez dotyku przez 3 minuty – powrót do kalendarza.
	onMount(() => {
		kioskBody();
		let lastTouch = Date.now();
		const onTouch = () => (lastTouch = Date.now());
		window.addEventListener('pointerdown', onTouch, true);
		const timer = setInterval(() => {
			if (Date.now() - lastTouch > 180_000) goto('/');
			else if (!openId && Date.now() - lastTouch > 20_000) updated.current ? location.reload() : invalidateAll();
		}, 30_000);
		return () => {
			window.removeEventListener('pointerdown', onTouch, true);
			clearInterval(timer);
		};
	});
</script>

<Stage>
	<main>
		<header>
			<h1>🐍 {t('snakes.title')}</h1>
			<span class="legend"
				><i class="lg feed"></i> {legend[0]} <i class="lg refused"></i> {legend[1]} <i class="lg shed"></i> {legend[2]} <i class="lg clean"></i> {legend[3]} <i class="lg win"></i>
				{legend[4]}</span
			>
			<a class="back" href="/">📅 {t('common.appName')}</a>
		</header>

		<section class="grid">
			{#each data.snakes as s (s.id)}
				<button type="button" class="card {s.state}" style:--c={s.color} onclick={() => show(s)}>
					<div class="name">{s.name} <span class="sex">{SEX[s.sex]}</span></div>
					<div class="species">{s.species}{s.born ? ` · ${s.born}` : ''}</div>
					<div class="due">{feedLine(s, data.today)}</div>
					<div class="row">
						<span>🍽 {agoLabel(s.lastFeed, data.today)}{s.lastFood ? ` · ${foodLabel(s.lastFood)}` : ''}</span>
						<span class="muted">{intervalLabel(s)}</span>
					</div>
					<div class="tl" aria-hidden="true">
						{#each s.events.filter((e) => e.type !== 'weight' && inRange(e.date)) as e (e.id)}
							<span class="m {e.type}" style:left="{pos(e.date)}%"></span>
						{/each}
						{#if s.nextFeed && s.dueBy && s.dueBy > s.nextFeed && s.dueBy >= data.today && s.state !== 'paused'}
							{@const a = s.nextFeed < addDays(data.today, -PAST) ? addDays(data.today, -PAST) : s.nextFeed}
							{@const b = s.dueBy > addDays(data.today, AHEAD) ? addDays(data.today, AHEAD) : s.dueBy}
							{#if a < b}<span class="win" style:left="{pos(a)}%" style:width="{(Number(pos(b)) - Number(pos(a))).toFixed(2)}%"></span>{/if}
						{/if}
						<span class="now" style:left="{pos(data.today)}%"></span>
						{#if s.nextFeed && inRange(s.nextFeed) && s.nextFeed > data.today}<span class="m next" style:left="{pos(s.nextFeed)}%"></span>{/if}
					</div>
					{#if s.lastRefused}<div class="row refused">✋ {t(`snakes.refused.${sx(s)}`, { when: agoLabel(s.lastRefused, data.today) })}</div>{/if}
					<div class="row small">
						<span>🐍 {t('snakes.shedAgo', { when: agoLabel(s.lastShed, data.today) })}</span>
						<span>🧽 {agoLabel(s.lastClean, data.today)}</span>
						{#if s.lastWeight}<span>⚖️ {s.lastWeight.grams} g</span>{/if}
					</div>
				</button>
			{/each}
		</section>

		<section class="food">
			<h2>{t('snakes.food')}</h2>
			{#each data.food as f (f.id)}
				<div class="stock" class:low={f.count < f.minCount}>
					<button type="button" onclick={() => stock(f.id, -1)} disabled={f.count === 0} aria-label={t('pantry.less')}>−</button>
					<span><b>{f.count}</b> × {f.label}</span>
					<button type="button" onclick={() => stock(f.id, 1)} aria-label={t('pantry.more')}>+</button>
				</div>
			{/each}
		</section>
	</main>

	{#if open}
		<Sheet title="{open.name} {SEX[open.sex]}" closeLabel="✕ {t('common.close')}" onclose={() => (openId = null)}>
			{#if mode === 'main'}
				<div class="detail">
					<div class="actions">
						<div class="label">{t('snakes.food')}</div>
						<div class="chips">
							{#each data.food as f (f.id)}
								<button type="button" class="chip" class:on={food === f.id} class:empty={f.count === 0} onclick={() => (food = food === f.id ? null : f.id)}>
									{f.label} <small>({f.count})</small>
								</button>
							{/each}
						</div>
						<div class="big">
							<button type="button" class="act feed" onclick={() => record('feed')}>🍽 {t(`snakes.fed.${sx(open)}`)}{food ? ` · ${foodLabel(food)}` : ''}</button>
							<button type="button" class="act" onclick={() => record('refused')}>✋ {t(`snakes.refusedBtn.${sx(open)}`)}</button>
						</div>
						<div class="big">
							<button type="button" class="act" onclick={() => record('shed')}>🐍 {label('shed')}</button>
							<button type="button" class="act" onclick={() => record('clean')}>🧽 {label('clean')}</button>
						</div>
						<div class="big">
							<button type="button" class="act" onclick={() => (mode = 'weight')}>⚖️ {label('weight')}</button>
							{#if open.pauseUntil}
								<button type="button" class="act" onclick={() => pause(null)}>▶ {t('snakes.resume')}</button>
							{:else}
								<button type="button" class="act" onclick={() => (mode = 'pause')}>⏸ {t('snakes.pause')}</button>
							{/if}
						</div>
						<p class="info">
							{open.species}{open.born ? `, ${t('snakes.born', { date: open.born })}` : ''} · {t('snakes.feedingEvery', { interval: intervalLabel(open) })}{open.intervalAuto
								? ` ${t('snakes.fromHistory')}`
								: ''} · {feedLine(open, data.today)}
						</p>
					</div>
					<div class="history">
						<div class="label">{t('snakes.history')}</div>
						<ol>
							{#each open.events.slice(0, 14) as e (e.id)}
								<li class={e.type}>
									<span class="d">{short(e.date)}</span>
									<span>{ICON[e.type]} {label(e.type)}{e.food ? ` · ${foodLabel(e.food)}` : ''}{e.grams ? ` · ${e.grams} g` : ''}</span>
								</li>
							{:else}
								<li class="muted">{t('snakes.noEntries')}</li>
							{/each}
						</ol>
					</div>
				</div>
			{:else if mode === 'weight'}
				<div class="label">{t('snakes.weightOf', { name: open.name })}</div>
				<div class="field">{grams || ''}<span class="caret"></span> g</div>
				<div class="pad">
					{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'] as k (k)}
						<button type="button" onclick={() => key(k)}>{k}</button>
					{/each}
				</div>
				<div class="foot">
					<button type="button" class="btn" onclick={() => (mode = 'main')}>‹ {t('common.back')}</button>
					<button type="button" class="btn primary" disabled={!grams} onclick={() => record('weight')}>✓ {t('snakes.saveGrams', { grams })}</button>
				</div>
			{:else}
				<div class="label">{t('snakes.pauseHint')}</div>
				<DayPicker today={addDays(data.today, 1)} bind:value={pauseDay} />
				<div class="foot">
					<button type="button" class="btn" onclick={() => (mode = 'main')}>‹ {t('common.back')}</button>
					<button type="button" class="btn primary" onclick={() => pause(pauseDay)}>⏸ {t('snakes.pauseUntilBtn', { date: short(pauseDay) })}</button>
				</div>
			{/if}
		</Sheet>
	{/if}

	{#if toast}
		<div class="toast" class:error={toast.error} transition:fly={{ y: 60, duration: 200 }}>
			<span>{toast.error ? toast.text : `✓ ${toast.text}`}</span>
			{#if toast.undoId}<button type="button" onclick={undo}>{t('common.undo')}</button>{:else}<button type="button" onclick={() => (toast = null)}>{t('common.ok')}</button>{/if}
		</div>
	{/if}
</Stage>

<style>
	main {
		width: 100%;
		height: 100%;
		padding: 22px;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 18px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 28px;
	}
	h1 {
		margin: 0;
		font: 800 60px var(--font-head);
	}
	.legend {
		font-size: 22px;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.lg {
		display: inline-block;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		margin-left: 10px;
	}
	.lg.feed {
		background: var(--fg);
	}
	.lg.refused {
		border: 3px solid #e8590c;
	}
	.lg.shed {
		background: #2f9e44;
		width: 9px;
		height: 22px;
		border-radius: 5px;
	}
	.lg.clean {
		background: #1c7ed6;
		border-radius: 3px;
		width: 11px;
		height: 11px;
	}
	.lg.win {
		width: 26px;
		height: 10px;
		border-radius: 5px;
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}
	.lg.next {
		border: 3px dashed var(--fg);
	}
	.back {
		margin-left: auto;
		font: 700 30px var(--font-body);
		padding: 18px 30px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		text-decoration: none;
		box-shadow: var(--shadow);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-rows: repeat(2, minmax(0, 1fr));
		gap: 18px;
		min-height: 0;
	}
	.card {
		text-align: left;
		border-radius: 24px;
		border: 4px solid var(--line);
		border-left: 16px solid var(--c);
		background: var(--card);
		color: var(--fg);
		padding: 22px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-family: var(--font-body);
		box-shadow: var(--shadow);
		min-height: 0;
		overflow: hidden;
	}
	/* lewy pasek = kolor węża, reszta obramowania = stan */
	.card.due {
		border-top-color: #e8590c;
		border-right-color: #e8590c;
		border-bottom-color: #e8590c;
	}
	.card.soon {
		border-top-color: #f2b705;
		border-right-color: #f2b705;
		border-bottom-color: #f2b705;
	}
	.card.paused {
		opacity: 0.75;
	}
	.name {
		font: 800 46px var(--font-head);
	}
	.sex {
		color: var(--muted);
		font-size: 36px;
	}
	.species {
		font-size: 24px;
		color: var(--muted);
		margin-top: -6px;
	}
	.due {
		font-size: 36px;
		font-weight: 800;
	}
	.card.due .due {
		color: #c2410c;
	}
	.card.paused .due {
		color: var(--muted);
	}
	.row {
		display: flex;
		gap: 22px;
		font-size: 27px;
		flex-wrap: wrap;
	}
	.row.small {
		font-size: 23px;
		color: var(--muted);
		margin-top: auto;
	}
	.refused {
		color: #c2410c;
	}
	.tl {
		position: relative;
		height: 34px;
		margin: 6px 4px 0;
		background: linear-gradient(var(--line), var(--line)) center / 100% 3px no-repeat;
	}
	.tl .m {
		position: absolute;
		top: 50%;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}
	.tl .feed {
		background: var(--c);
	}
	.tl .refused {
		background: var(--card);
		border: 4px solid #e8590c;
	}
	.tl .shed {
		background: #2f9e44;
		width: 12px;
		height: 30px;
		border-radius: 6px;
	}
	.tl .clean {
		background: #1c7ed6;
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}
	.tl .win {
		position: absolute;
		top: 50%;
		height: 14px;
		transform: translateY(-50%);
		border-radius: 7px;
		background: color-mix(in srgb, var(--c) 30%, transparent);
	}
	.tl .next {
		background: transparent;
		border: 4px dashed var(--fg);
	}
	.tl .now {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		background: #c2410c;
	}
	.muted {
		color: var(--muted);
	}
	.food {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--card);
		border-radius: 24px;
		padding: 14px 18px;
		box-shadow: var(--shadow);
	}
	.food h2 {
		margin: 0 6px 0 0;
		font: 800 30px var(--font-head);
	}
	.stock {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		border: 3px solid var(--line);
		border-radius: 18px;
		padding: 5px;
		font-size: 21px;
		white-space: nowrap;
	}
	.stock b {
		font-size: 28px;
	}
	.stock.low {
		border-color: var(--alert);
		color: var(--alert);
	}
	.stock button {
		flex: none;
		width: 48px;
		height: 54px;
		border-radius: 12px;
		border: none;
		background: var(--bg);
		color: var(--fg);
		font: 700 34px var(--font-body);
	}
	.stock button:disabled {
		opacity: 0.3;
	}
	.detail {
		display: grid;
		grid-template-columns: 1fr 560px;
		gap: 40px;
		min-height: 0;
		flex: 1;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.chip.empty {
		opacity: 0.45;
	}
	.chip small {
		font-size: 22px;
		opacity: 0.7;
	}
	.big {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}
	.act {
		height: 120px;
		border-radius: 22px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 700 36px var(--font-body);
	}
	.act.feed {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.info {
		margin: auto 0 0;
		font-size: 24px;
		color: var(--muted);
	}
	.history {
		min-height: 0;
		overflow: hidden;
	}
	.history ol {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 26px;
	}
	.history li {
		display: flex;
		gap: 18px;
		padding: 8px 16px;
		border-radius: 12px;
		background: var(--card);
	}
	.history li.refused {
		color: #c2410c;
	}
	.history .d {
		font-weight: 700;
		min-width: 90px;
	}
	.pad {
		display: grid;
		grid-template-columns: repeat(3, 180px);
		gap: 14px;
	}
	.pad button {
		height: 100px;
		border-radius: 18px;
		border: 3px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 700 44px var(--font-body);
	}
	.foot {
		display: flex;
		gap: 18px;
		margin-top: auto;
		justify-content: flex-end;
	}
	.toast {
		position: absolute;
		left: 50%;
		bottom: 40px;
		transform: translateX(-50%);
		z-index: 30;
		background: var(--fg);
		color: var(--card);
		border-radius: 20px;
		font: 600 30px var(--font-body);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: center;
		gap: 30px;
		padding: 16px 16px 16px 32px;
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
