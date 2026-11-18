<script lang="ts">
	import { onMount } from 'svelte';
	import Sheet from '#lib/components/kiosk/Sheet.svelte';
	import { t, tn } from '#lib/i18n/index.js';
	import type { KidRepeat } from '#lib/server/db/schema.js';
	import { needPin, pinIsSet } from '#lib/kiosk/pin.svelte.js';

	/**
	 * Okno zadań dzieci: kolumna na dziecko z dużymi przyciskami zadań (dotknięcie = zrobione,
	 * ponowne = cofnij) i zakładka nagród (prośba czeka na zgodę rodzica).
	 */
	let { onclose, onchanged }: { onclose: () => void; onchanged: () => void } = $props();

	type Task = { id: number; title: string; emoji: string; points: number; repeat: KidRepeat; done: boolean };
	type Kid = { memberId: string; name: string; color: string; points: number; done: number; total: number; tasks: Task[] };
	type Reward = { id: number; title: string; emoji: string; cost: number };
	type Pending = { id: number; memberId: string; title: string; emoji: string; cost: number };
	type State = { kids: Kid[]; rewards: Reward[]; pending: Pending[]; celebrate: boolean };

	let st = $state<State | null>(null);
	let tab = $state<'tasks' | 'rewards'>('tasks');
	let failed = $state(false);
	let busy = $state(false);
	// Rozbłysk po odhaczeniu: klucz zadania + licznik (żeby ponowne odhaczenie znów zagrało).
	let burst = $state<{ id: number; n: number; text: string } | null>(null);
	let who = $state<string | null>(null);
	let confirm = $state<Reward | null>(null);
	let sent = $state<string | null>(null);

	const JSON_HEADERS = { 'content-type': 'application/json' };
	const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const cheers = () => t('kids.cheer').split('|');

	async function load() {
		try {
			const r = await fetch('/api/kids');
			if (!r.ok) throw new Error();
			st = await r.json();
			failed = false;
			if (!who && st!.kids.length === 1) who = st!.kids[0].memberId;
		} catch {
			failed = true;
		}
	}
	onMount(load);

	async function tap(kid: Kid, task: Task) {
		const next = !task.done;
		// Od razu na ekranie; serwer potwierdza i podaje nowe saldo.
		task.done = next;
		kid.done += next ? 1 : -1;
		kid.points += next ? task.points : -task.points;
		if (next) {
			const list = cheers();
			burst = { id: task.id, n: (burst?.n ?? 0) + 1, text: `${list[Math.floor(Math.random() * list.length)]} +${task.points} ⭐` };
			setTimeout(() => burst?.id === task.id && (burst = null), 1600);
		} else if (burst?.id === task.id) burst = null;
		try {
			const r = await fetch('/api/kids/done', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ taskId: task.id, done: next }) });
			if (!r.ok) throw new Error();
			kid.points = (await r.json()).points;
			onchanged();
		} catch {
			failed = true;
			await load();
		}
	}

	async function ask(reward: Reward) {
		if (!who) return;
		busy = true;
		try {
			const r = await fetch('/api/kids/redeem', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ memberId: who, rewardId: reward.id }) });
			if (!r.ok) throw new Error();
			sent = t('kids.requested', { title: `${reward.emoji} ${reward.title}` });
			confirm = null;
			await load();
			onchanged();
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	// --- p4: security --- zgoda rodzica na kiosku: tylko z ustawionym PIN-em i zawsze po PIN-ie.
	async function decide(p: Pending, approve: boolean) {
		if (!(await needPin('approve'))) return;
		busy = true;
		try {
			const r = await fetch('/api/kids/decide', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ id: p.id, approve }) });
			if (!r.ok) throw new Error();
			await load();
			onchanged();
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	const kid = $derived(st?.kids.find((k) => k.memberId === who) ?? null);
	const repeatLabel = (r: KidRepeat) => (r.type === 'weekly' ? t('kids.thisWeek') : '');
</script>

<Sheet title="⭐ {t('module.kids')}" {onclose} closeLabel="✕ {t('common.close')}">
	<div class="tabs" role="tablist">
		<button type="button" role="tab" class="chip" class:on={tab === 'tasks'} aria-selected={tab === 'tasks'} onclick={() => (tab = 'tasks')}>✅ {t('kids.tasksToday')}</button>
		<button type="button" role="tab" class="chip" class:on={tab === 'rewards'} aria-selected={tab === 'rewards'} onclick={() => ((tab = 'rewards'), (sent = null), (confirm = null))}>🎁 {t('kids.rewards')}</button>
		{#if failed}<span class="error">{t('add.saveFailed')}</span>{/if}
	</div>

	{#if !st}
		<p class="muted">…</p>
	{:else if !st.kids.length}
		<p class="muted">{t('kids.noKids')}</p>
	{:else if tab === 'tasks'}
		<div class="cols" style:--n={st.kids.length}>
			{#each st.kids as k (k.memberId)}
				<section class="kid" style:--c={k.color} data-kid={k.memberId}>
					<header>
						<span class="name">{k.name}</span>
						<span class="pts" data-points>{k.points} ⭐</span>
					</header>
					<div class="bar"><span style:width="{k.total ? (k.done / k.total) * 100 : 0}%"></span></div>
					<p class="sub">{k.total ? (k.done === k.total ? `🎉 ${t('kids.allDone')}` : t('kids.progress', { done: k.done, total: k.total })) : t('kids.noTasks')}</p>
					<div class="tasks">
						{#each k.tasks as task (task.id)}
							<button type="button" class="task" class:done={task.done} aria-pressed={task.done} onclick={() => tap(k, task)}>
								<span class="emo">{task.emoji}</span>
								<span class="title">{task.title}{#if repeatLabel(task.repeat)}<small>{repeatLabel(task.repeat)}</small>{/if}</span>
								<span class="earn">{task.done ? '✓' : `+${task.points}`}</span>
								{#if burst?.id === task.id}
									{#key burst.n}
										<span class="cheer" class:still={reduced || !st.celebrate} aria-live="polite">{burst.text}</span>
										{#if !reduced && st.celebrate}
											<span class="stars" aria-hidden="true">{#each [0, 1, 2, 3, 4, 5] as i (i)}<i style:--i={i}>⭐</i>{/each}</span>
										{/if}
									{/key}
								{/if}
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
		<p class="hint">{t('kids.tapUndo')}</p>
	{:else}
		<div class="who chips">
			<span class="label">{t('kids.whoAsks')}</span>
			{#each st.kids as k (k.memberId)}
				<button type="button" class="chip person" class:on={who === k.memberId} style:--c={k.color} onclick={() => ((who = k.memberId), (sent = null), (confirm = null))}>
					<span class="dot"></span>{k.name} · {k.points} ⭐
				</button>
			{/each}
		</div>
		{#if sent}
			<div class="sent">
				<div class="big">🎁</div>
				<p><b>{sent}</b></p>
				<p class="muted">{t('kids.waiting')}</p>
			</div>
		{:else if confirm && kid}
			<div class="confirm">
				<span class="big">{confirm.emoji}</span>
				<p><b>{confirm.title}</b> · {confirm.cost} ⭐</p>
				<p class="muted">{kid.name}: {kid.points} ⭐ → {kid.points - confirm.cost} ⭐</p>
				<div class="row">
					<button type="button" class="btn" onclick={() => (confirm = null)}>{t('common.cancel')}</button>
					<button type="button" class="btn primary" disabled={busy} onclick={() => ask(confirm!)}>✓ {t('kids.ask')}</button>
				</div>
			</div>
		{:else}
			<div class="rewards">
				{#each st.rewards as r (r.id)}
					{@const short = kid ? r.cost - kid.points : r.cost}
					<button type="button" class="reward" disabled={!kid || short > 0} onclick={() => (confirm = r)}>
						<span class="emo">{r.emoji}</span>
						<span class="title">{r.title}</span>
						<span class="cost">{r.cost} ⭐</span>
						{#if kid && short > 0}<small>{tn('kids.short', short)}</small>{/if}
					</button>
				{/each}
			</div>
			{#if kid && st.pending.some((p) => p.memberId === kid.memberId)}
				<div class="pending">
					<span class="label">{t('kids.waiting')}</span>
					{#each st.pending.filter((p) => p.memberId === kid.memberId) as p (p.id)}
						<span class="chip" data-pending={p.id}>{p.emoji} {p.title} · {p.cost} ⭐</span>
						{#if pinIsSet()}
							<button type="button" class="chip" disabled={busy} onclick={() => decide(p, true)} data-approve={p.id}>✓ {t('kids.approve')}</button>
							<button type="button" class="chip" disabled={busy} onclick={() => decide(p, false)}>✕ {t('kids.reject')}</button>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</Sheet>

<style>
	.tabs {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.cols {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 24px;
	}
	.kid {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		background: color-mix(in srgb, var(--c) 7%, var(--card));
		border-top: 10px solid var(--c);
		border-radius: 20px;
		padding: 18px 20px 20px;
	}
	.kid header {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}
	.name {
		flex: 1;
		font: 800 44px var(--font-head);
		color: color-mix(in srgb, var(--c) 65%, var(--fg));
	}
	.pts {
		font: 800 44px var(--font-head);
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 22px;
		border-radius: 11px;
		background: var(--event-bg);
		overflow: hidden;
		box-shadow: inset 0 0 0 2px var(--line);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
		transition: width 0.45s cubic-bezier(0.3, 1.4, 0.6, 1);
	}
	.sub {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
		color: var(--muted);
	}
	.tasks {
		display: flex;
		flex-direction: column;
		gap: 14px;
		overflow-y: auto;
		touch-action: pan-y;
		min-height: 0;
		padding: 4px;
	}
	.task {
		position: relative;
		display: flex;
		align-items: center;
		gap: 18px;
		min-height: 118px;
		padding: 14px 20px;
		border-radius: 20px;
		border: 4px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 700 32px/1.15 var(--font-body);
		text-align: left;
		box-shadow: 0 6px 0 var(--line);
		transition:
			transform 0.12s,
			box-shadow 0.12s,
			background 0.2s;
		flex: none;
	}
	.task:active {
		transform: translateY(4px);
		box-shadow: 0 2px 0 var(--line);
	}
	.task.done {
		background: color-mix(in srgb, var(--c) 22%, var(--card));
		border-color: var(--c);
		box-shadow: 0 6px 0 color-mix(in srgb, var(--c) 60%, #000);
	}
	.task.done .title {
		text-decoration: line-through 3px;
		text-decoration-color: color-mix(in srgb, var(--c) 70%, transparent);
	}
	.task .emo {
		font-size: 56px;
		line-height: 1;
		flex: none;
	}
	.task .title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.task small {
		font-size: 20px;
		font-weight: 600;
		color: var(--muted);
	}
	.earn {
		flex: none;
		min-width: 76px;
		height: 64px;
		border-radius: 32px;
		display: grid;
		place-items: center;
		font: 800 28px var(--font-body);
		background: var(--event-bg);
		border: 3px solid var(--line);
	}
	.task.done .earn {
		background: var(--c);
		border-color: var(--c);
		color: #fff;
		font-size: 34px;
	}
	.cheer {
		position: absolute;
		right: 110px;
		top: 50%;
		transform: translateY(-50%);
		padding: 8px 18px;
		border-radius: 999px;
		background: var(--fg);
		color: var(--card);
		font: 800 26px var(--font-body);
		white-space: nowrap;
		pointer-events: none;
		animation: cheer 1.6s ease-out forwards;
	}
	.cheer.still {
		animation: none;
	}
	.stars {
		position: absolute;
		right: 38px;
		top: 50%;
		pointer-events: none;
	}
	.stars i {
		position: absolute;
		font-style: normal;
		font-size: 30px;
		animation: star 0.9s ease-out forwards;
		--a: calc(var(--i) * 60deg);
	}
	@keyframes star {
		from {
			transform: rotate(var(--a)) translateY(0) scale(0.4);
			opacity: 1;
		}
		to {
			transform: rotate(var(--a)) translateY(-90px) scale(1);
			opacity: 0;
		}
	}
	@keyframes cheer {
		0% {
			opacity: 0;
			transform: translateY(-50%) scale(0.7);
		}
		15% {
			opacity: 1;
			transform: translateY(-50%) scale(1.06);
		}
		25% {
			transform: translateY(-50%) scale(1);
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.task,
		.bar span {
			transition: none;
		}
		.cheer {
			animation: none;
		}
	}
	.hint {
		margin: 0;
		font-size: 22px;
		color: var(--muted);
	}
	.label {
		font: 700 22px var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.who {
		align-items: center;
	}
	.person .dot {
		display: inline-block;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--c);
		margin-right: 10px;
		vertical-align: -2px;
	}
	.rewards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 18px;
		overflow-y: auto;
		touch-action: pan-y;
		min-height: 0;
	}
	.reward {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: 18px;
		align-items: center;
		min-height: 130px;
		padding: 16px 22px;
		border-radius: 20px;
		border: 4px solid var(--line);
		background: var(--card);
		color: var(--fg);
		text-align: left;
		font: 700 30px/1.2 var(--font-body);
	}
	.reward:disabled {
		opacity: 0.45;
	}
	.reward .emo {
		grid-row: span 3;
		font-size: 64px;
	}
	.reward .cost {
		font: 800 28px var(--font-head);
	}
	.reward small {
		font-size: 20px;
		color: var(--muted);
	}
	.pending {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
	}
	.confirm,
	.sent {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		font-size: 36px;
		text-align: center;
	}
	.confirm p,
	.sent p {
		margin: 0;
	}
	.big {
		font-size: 120px;
		line-height: 1;
	}
	.row {
		display: flex;
		gap: 18px;
		margin-top: 16px;
	}
	.muted {
		color: var(--muted);
		font-size: 30px;
		margin: 0;
	}
	.error {
		color: var(--alert);
		font-size: 24px;
		font-weight: 700;
	}
</style>
