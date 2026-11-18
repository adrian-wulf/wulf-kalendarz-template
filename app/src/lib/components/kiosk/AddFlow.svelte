<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Keyboard from './Keyboard.svelte';
	import MemberPicker from './MemberPicker.svelte';
	import DayPicker from './DayPicker.svelte';
	import { dayHeader, fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import type { FlowKind, Member } from '#lib/types.js';

	let {
		kind,
		members,
		today,
		onclose,
		onsaved
	}: { kind: FlowKind; members: Member[]; today: string; onclose: () => void; onsaved: () => void } = $props();

	const list = (s: string) => s.split('|');
	const config = () => ({
		event: { title: t('add.event.title'), steps: list(t('add.event.steps')), quick: list(t('add.event.quick')) },
		note: { title: t('add.note.title'), steps: list(t('add.note.steps')), quick: list(t('add.note.quick')) },
		chore: { title: t('add.chore.title'), steps: list(t('add.chore.steps')), quick: list(t('add.chore.quick')) },
		shopping: { title: t('add.shopping.title'), steps: [] as string[], quick: [] as string[] }
	});
	const cfg = $derived(config()[kind]);

	let step = $state(0);
	let memberId = $state<string | null>(null);
	let text = $state('');
	let date = $state('');
	let time = $state<string | null>(null);
	let hour = $state<number | null>(null);
	let minute = $state(0);
	let duration = $state<'evening' | 'tomorrow' | '3days'>('tomorrow');
	let repeat = $state<'once' | 'weekly' | 'monthly'>('once');
	let saving = $state(false);
	let failed = $state(false);
	let done = $state<string | null>(null);

	// Zakupy: podpowiedzi i lista dodanych w tej sesji
	let suggestions = $state<{ name: string; icon: string }[]>([]);
	let added = $state<string[]>([]);

	$effect(() => {
		date = today;
	});

	$effect(() => {
		time = hour === null ? null : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	});

	$effect(() => {
		if (kind !== 'shopping') return;
		const q = text;
		if (!q.trim()) return void (suggestions = []);
		const ctrl = new AbortController();
		fetch(`/api/shopping/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
			.then((r) => r.json())
			.then((s) => (suggestions = s))
			.catch(() => {});
		return () => ctrl.abort();
	});

	const textStep = $derived(kind === 'chore' ? 0 : 1);
	const memberStep = $derived(kind === 'chore' ? 1 : 0);
	const memberName = $derived(members.find((m) => m.id === memberId)?.name);

	async function post(url: string, body: unknown) {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!r.ok) throw new Error(await r.text());
		return r.json();
	}

	async function save() {
		saving = true;
		failed = false;
		try {
			if (kind === 'event') await post('/api/events', { memberId, title: text, date, time });
			if (kind === 'note') await post('/api/notes', { memberId, text, duration });
			if (kind === 'chore') await post('/api/chores', { memberId, title: text, date, repeat });
			onsaved();
			done = summary();
			setTimeout(onclose, 1600);
		} catch {
			failed = true;
		} finally {
			saving = false;
		}
	}

	async function addProduct(name: string) {
		const n = name.trim();
		if (!n) return;
		try {
			await post('/api/shopping', { name: n });
			added = [n, ...added.filter((a) => a !== n)];
			text = '';
			onsaved();
		} catch {
			failed = true;
		}
	}

	function summary() {
		const who = memberName ?? (kind === 'chore' ? t('add.anyone') : t('add.wholeFamily'));
		const when = date === today ? t('common.todayLower') : `${dayHeader(date).wd} ${fmtShortDate(date)}`;
		if (kind === 'event') return `${who} · ${text} · ${when}${time ? `, ${time}` : ''}`;
		if (kind === 'note') return `${who}: ${t('common.quoted', { text })}`;
		return `${text} · ${who} · ${when}`;
	}

	const pickMember = (id: string | null) => {
		memberId = id;
		step++;
	};
	const next = () => {
		if (text.trim()) step++;
	};
</script>

<Sheet title={cfg.title} steps={[...cfg.steps]} {step} {onclose}>
	{#if done}
		<div class="done">
			<div class="check">✓</div>
			<p class="big">{t('add.saved')}</p>
			<p>{done}</p>
		</div>
	{:else if kind === 'shopping'}
		<div class="field">{text}<span class="caret"></span>{#if !text}<span class="ph"> {t('add.shopping.placeholder')}</span>{/if}</div>
		<div class="chips sugg">
			{#each suggestions as s (s.name)}
				<button type="button" class="chip" onclick={() => addProduct(s.name)}>{s.icon} {s.name}</button>
			{/each}
			{#if text.trim() && !suggestions.some((s) => s.name.toLowerCase() === text.trim().toLowerCase())}
				<button type="button" class="chip on" onclick={() => addProduct(text)}>+ {t('common.quoted', { text: text.trim() })}</button>
			{/if}
		</div>
		{#if added.length}<p class="added">✓ {t('add.shopping.added', { list: added.join(', ') })}</p>{/if}
		{#if failed}<p class="error">{t('add.shopping.failed')}</p>{/if}
		<div class="spacer"></div>
		<Keyboard bind:value={text} max={60} onenter={() => (text.trim() ? addProduct(text) : onclose())} enterLabel={text.trim() ? t('common.add') : `✓ ${t('common.done')}`} />
	{:else if step === memberStep}
		<p class="label">{kind === 'chore' ? t('add.chore.who') : kind === 'note' ? t('add.note.who') : t('add.event.who')}</p>
		<MemberPicker {members} onpick={pickMember} allLabel={kind === 'chore' ? `🙋 ${t('add.anyoneTile')}` : `👨‍👩‍👧‍👦 ${t('add.wholeFamilyTile')}`} />
	{:else if step === textStep}
		<p class="label">{kind === 'note' ? t('add.note.what') : kind === 'chore' ? t('add.chore.what') : t('add.event.what')}{memberName ? ` · ${memberName}` : ''}</p>
		<div class="field">{text}<span class="caret"></span>{#if !text}<span class="ph"> {t('add.placeholder')}</span>{/if}</div>
		<div class="chips">
			{#each cfg.quick as q (q)}
				<button type="button" class="chip" onclick={() => (text = q)}>{q}</button>
			{/each}
		</div>
		<div class="spacer"></div>
		<Keyboard bind:value={text} max={kind === 'note' ? 200 : 120} onenter={next} enterDisabled={!text.trim()} onback={step > 0 ? () => step-- : undefined} />
	{:else}
		{#if kind === 'note'}
			<p class="label">{t('add.note.howLong')}</p>
			<div class="chips">
				<button type="button" class="chip" class:on={duration === 'evening'} onclick={() => (duration = 'evening')}>{t('add.note.evening')}</button>
				<button type="button" class="chip" class:on={duration === 'tomorrow'} onclick={() => (duration = 'tomorrow')}>{t('add.note.tomorrow')}</button>
				<button type="button" class="chip" class:on={duration === '3days'} onclick={() => (duration = '3days')}>{t('add.note.3days')}</button>
			</div>
		{:else}
			<p class="label">{t('add.whichDay')}</p>
			<DayPicker {today} bind:value={date} />
			{#if kind === 'event'}
				<p class="label">{t('add.event.when')}</p>
				<div class="chips">
					<button type="button" class="chip" class:on={hour === null} onclick={() => (hour = null)}>{t('add.event.allDay')}</button>
					{#each Array.from({ length: 16 }, (_, i) => i + 6) as h (h)}
						<button type="button" class="chip hour" class:on={hour === h} onclick={() => (hour = h)}>{h}</button>
					{/each}
				</div>
				{#if hour !== null}
					<div class="chips">
						{#each [0, 15, 30, 45] as m (m)}
							<button type="button" class="chip" class:on={minute === m} onclick={() => (minute = m)}>{hour}:{String(m).padStart(2, '0')}</button>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="label">{t('add.chore.howOften')}</p>
				<div class="chips">
					<button type="button" class="chip" class:on={repeat === 'once'} onclick={() => (repeat = 'once')}>{t('repeat.once')}</button>
					<button type="button" class="chip" class:on={repeat === 'weekly'} onclick={() => (repeat = 'weekly')}>{t('repeat.weekly')}</button>
					<button type="button" class="chip" class:on={repeat === 'monthly'} onclick={() => (repeat = 'monthly')}>{t('repeat.monthly')}</button>
				</div>
			{/if}
		{/if}
		<div class="spacer"></div>
		{#if failed}<p class="error">{t('add.saveFailed')}</p>{/if}
		<p class="preview">{summary()}</p>
	{/if}

	{#snippet footer()}
		{#if !done && kind !== 'shopping' && step !== textStep}
			{#if step > 0}<button type="button" class="btn" onclick={() => step--}>← {t('common.back')}</button>{/if}
			{#if step === 2}
				<button type="button" class="btn primary" disabled={saving} onclick={save}>{saving ? t('common.saving') : `✓ ${t('common.save')}`}</button>
			{/if}
		{/if}
	{/snippet}
</Sheet>

<style>
	.spacer {
		flex: 1;
	}
	.done {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 34px;
	}
	.check {
		font-size: 140px;
		line-height: 1;
		color: #22a447;
	}
	.big {
		font: 800 56px var(--font-head);
		margin: 0;
	}
	.done p {
		margin: 0;
	}
	.hour {
		min-width: 86px;
	}
	.preview {
		font-size: 30px;
		color: var(--muted);
		margin: 0;
	}
	.error {
		color: var(--alert);
		font-size: 28px;
		font-weight: 700;
		margin: 0;
	}
	.added {
		font-size: 28px;
		color: #22a447;
		font-weight: 700;
		margin: 0;
	}
	.sugg {
		min-height: 80px;
	}
	.label {
		margin: 0;
	}
</style>
