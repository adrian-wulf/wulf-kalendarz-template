<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { msg, noReset, type ActionResult, type AdminMember } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { locale, t, tn } from '#lib/i18n/index.js';
	// --- 26b: guides ---
	import { parseDateList, seriesDates, weekdayOf } from '#lib/logic/waste-dates.js';
	import { holidayOn } from '#lib/logic/holidays.js';
	import { fmtWeekday } from '#lib/format.js';
	import EmptyState from '#lib/components/admin/EmptyState.svelte';

	let { data, form }: { data: AdminDataOf<typeof hooks> & { members: AdminMember[]; today: string }; form: ActionResult & { added?: number } } = $props();

	const binLabel = (bin: string) => data.bins.find((b) => b.bin === bin)?.label ?? bin;
	const binColor = (bin: string) => data.bins.find((b) => b.bin === bin)?.color ?? 'var(--muted)';
	const fmt = (d: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

	// --- 26b: guides --- cały rok naraz: seria albo wklejone daty, podgląd przed zapisem
	const today = untrack(() => data.today);
	const year = Number(today.slice(0, 4));
	// W listopadzie i grudniu zwykle wpisuje się harmonogram na następny rok.
	const nextYear = Number(today.slice(5, 7)) >= 11;
	let mode = $state<'series' | 'list'>('series');
	let bin = $state(untrack(() => data.bins[0]?.bin ?? ''));
	let first = $state('');
	let every = $state(2);
	let to = $state(`${nextYear ? year + 1 : year}-12-31`);
	let text = $state('');
	let listYear = $state(nextYear ? year + 1 : year);
	// Pierwszy wywóz z innego roku → koniec zakresu = koniec tamtego roku (zmienia się tylko, gdy zakres był domyślny).
	$effect(() => {
		if (first && to.endsWith('-12-31') && to < first) to = `${first.slice(0, 4)}-12-31`;
	});
	const parsed = $derived(mode === 'list' ? parseDateList(text, listYear) : null);
	const preview = $derived((mode === 'list' ? (parsed?.dates ?? []) : seriesDates({ first, to, every })).filter((d) => d >= data.today));
	const past = $derived((mode === 'list' ? (parsed?.dates ?? []) : seriesDates({ first, to, every })).length - preview.length);
	// Terminy tego pojemnika, które już są wpisane – nie zapiszą się drugi raz.
	const already = $derived(preview.filter((d) => data.manual.some((p) => p.bin === bin && p.date === d)).length);
	const holidays = $derived(preview.map((d) => ({ d, h: holidayOn(d) })).filter((x) => !!x.h));
	const byMonth = $derived(
		Object.entries(
			preview.reduce<Record<string, string[]>>((acc, d) => {
				(acc[d.slice(0, 7)] ??= []).push(d);
				return acc;
			}, {})
		)
	);
	const monthName = (ym: string) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`));
	const manualByBin = $derived(
		data.bins.map((b) => ({ ...b, dates: data.manual.filter((p) => p.bin === b.bin).map((p) => p.date) })).filter((b) => b.dates.length)
	);
	// Po zapisie pola daty się czyszczą – drugi klik nie dubluje serii, a podgląd jest pusty dla następnego pojemnika.
	const afterYear = () => async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		if (result.type === 'success') {
			first = '';
			text = '';
		}
	};
	const yearDone = $derived(form?.section === 'wasteYear' && form.ok ? form.added ?? 0 : null);
</script>

<section id="smieci" class="adm-sec">
	<h2>{t('waste.title')}</h2>
	{#if msg(form, 'waste')?.error}<p class="err">{msg(form, 'waste')?.error}</p>{/if}
	{#if msg(form, 'waste')?.ok}<p class="ok">{t('admin.saved')}.</p>{/if}

	<!-- --- 26b: guides --- najbliższe wywozy albo pusty stan z jedną akcją -->
	{#if data.upcoming.length}
		<h3>{t('guide.waste.upcoming')}</h3>
		<div class="chips" data-testid="waste-upcoming">
			{#each data.upcoming.slice(0, 12) as p (p.date + p.kind)}<span class="chip" data-date={p.date}><span class="bin-swatch" style:--c={p.color}></span>{fmt(p.date)} · {p.label}</span>{/each}
		</div>
		{#if !data.wasteIcs && !data.wasteIcalUrl && !data.manual.length}<p class="hint">{t('waste.noCalDemo')}</p>{/if}
	{:else}
		<EmptyState testid="waste-empty" title={t('empty.waste.title')} text={t('empty.waste.text')} href="#rok" action={t('empty.waste.action')} />
	{/if}
	{#if data.wasteIcs}
		<p class="muted">
			{t('waste.file')} <b>{data.wasteIcs.name}</b> ({data.wasteIcs.uploadedAt.slice(0, 10)}).
			{#if data.pickups.length}
				{t('waste.range', { from: data.pickups[0].date })} <b>{data.pickups[data.pickups.length - 1].date}</b> ({data.pickups.length}).
			{/if}
		</p>
		{#if data.pickups.length && data.pickups[data.pickups.length - 1].date < new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}
			<p class="err">{t('waste.ending')}</p>
		{/if}
	{/if}

	<h3 id="z-gminy">{t('guide.waste.fromTown')}</h3>
	{#if msg(form, 'wasteUrl')?.error}<p class="err">{msg(form, 'wasteUrl')?.error}</p>{/if}
	{#if msg(form, 'wasteUrl')?.ok}<p class="ok">{t('admin.saved')}.</p>{/if}
	<form method="POST" action="?/saveWasteUrl" use:enhance={noReset} class="row new">
		<label class="grow">{t('guide.waste.url')} <input name="wasteIcalUrl" type="url" value={data.wasteIcalUrl ?? ''} placeholder="https://…/abfuhrkalender.ics" /></label>
		<button class="primary">{t('common.save')}</button>
	</form>
	<form method="POST" action="?/uploadWaste" enctype="multipart/form-data" use:enhance class="row new">
		<label class="grow">{t('waste.upload')} <input type="file" name="file" accept=".ics,text/calendar" required /></label>
		<button class="primary">{t('waste.uploadBtn')}</button>
		{#if data.wasteIcs}<button formaction="?/removeWaste" formnovalidate class="danger">{t('waste.removeFile')}</button>{/if}
	</form>

	<!-- --- 26b: guides --- cały rok naraz -->
	<h3 id="rok">{t('guide.waste.yearTitle')}</h3>
	<p class="hint">{t('guide.waste.yearIntro')}</p>
	{#if msg(form, 'wasteYear')?.error}<p class="err">{msg(form, 'wasteYear')?.error}</p>{/if}
	{#if yearDone !== null}<p class="ok" data-testid="waste-year-saved">✓ {tn('guide.waste.added', yearDone)}</p>{/if}
	<form method="POST" action="?/addManualPickups" use:enhance={afterYear} class="year" data-testid="waste-year">
		<div class="modes" role="radiogroup" aria-label={t('guide.waste.yearTitle')}>
			<label class="check"><input type="radio" name="mode" value="series" bind:group={mode} /> {t('guide.waste.modeSeries')}</label>
			<label class="check"><input type="radio" name="mode" value="list" bind:group={mode} /> {t('guide.waste.modeList')}</label>
		</div>
		<div class="row new">
			<label>
				{t('waste.bin')}
				<select name="bin" bind:value={bin} data-testid="year-bin">{#each data.bins as b (b.bin)}<option value={b.bin}>{b.label}</option>{/each}</select>
			</label>
			{#if mode === 'series'}
				<label>
					{t('guide.waste.first')}
					<input type="date" name="first" bind:value={first} min={data.today} required data-testid="year-first" />
				</label>
				<label>
					{t('guide.waste.every')}
					<select name="every" bind:value={every} data-testid="year-every">
						<option value={1}>{t('guide.waste.every1')}</option>
						<option value={2}>{t('guide.waste.every2')}</option>
						<option value={3}>{t('guide.waste.every3')}</option>
						<option value={4}>{t('guide.waste.every4')}</option>
						<option value={0}>{t('guide.waste.monthly')}</option>
					</select>
				</label>
				<label>
					{t('guide.waste.to')}
					<input type="date" name="to" bind:value={to} min={first || data.today} required data-testid="year-to" />
				</label>
			{:else}
				<label>
					{t('guide.waste.year')}
					<select name="year" bind:value={listYear}>
						<option value={year}>{year}</option>
						<option value={year + 1}>{year + 1}</option>
					</select>
				</label>
			{/if}
		</div>
		{#if mode === 'series' && first}
			<p class="hint">{t('guide.waste.weekdayIs', { day: fmtWeekday(first) })}</p>
		{/if}
		{#if mode === 'list'}
			<label class="paste">
				{t('guide.waste.paste')}
				<textarea name="text" rows="5" bind:value={text} placeholder={t('guide.waste.pastePlaceholder')} data-testid="year-text"></textarea>
			</label>
		{/if}

		<div class="year-preview" data-testid="year-preview" aria-live="polite">
			{#if preview.length}
				<p><b>{t('guide.waste.preview')}</b> {tn('guide.waste.previewCount', preview.length, { bin: binLabel(bin) })}</p>
				<div class="months">
					{#each byMonth as [ym, ds] (ym)}
						<div class="month"><span class="m">{monthName(ym)}</span> {#each ds as d (d)}<span class="day" class:hol={holidays.some((x) => x.d === d)} style:--c={binColor(bin)}>{Number(d.slice(8, 10))}</span>{/each}</div>
					{/each}
				</div>
				{#each holidays as x (x.d)}<p class="warn">⚠ {t('guide.waste.holiday', { date: fmt(x.d), name: x.h?.name ?? '' })}</p>{/each}
			{:else}
				<p class="muted">{mode === 'series' ? t('guide.waste.previewEmptySeries') : t('guide.waste.previewEmptyList')}</p>
			{/if}
			{#if already > 0}<p class="muted" data-testid="year-already">{tn('guide.waste.already', already)}</p>{/if}
			{#if past > 0}<p class="muted">{tn('guide.waste.pastSkipped', past)}</p>{/if}
			{#if parsed?.bad.length}<p class="warn">{t('guide.waste.bad', { list: parsed.bad.slice(0, 5).join(' · ') })}</p>{/if}
		</div>
		<div class="actions">
			<button class="primary" disabled={!preview.length || !bin} data-testid="year-save">{preview.length ? tn('guide.waste.save', preview.length) : t('guide.waste.saveNone')}</button>
		</div>
	</form>

	<h3>{t('waste.manual')}</h3>
	{#if msg(form, 'wasteManual')?.error}<p class="err">{msg(form, 'wasteManual')?.error}</p>{/if}
	{#each manualByBin as b (b.bin)}
		<details class="bin-list" data-bin={b.bin}>
			<summary><span class="bin-swatch" style:--c={b.color}></span> <b>{b.label}</b> · {tn('guide.waste.count', b.dates.length)}</summary>
			<div class="chips">
				{#each b.dates as d (d)}
					<form method="POST" action="?/deleteManualPickup" use:enhance class="chip" data-date={d}>
						<input type="hidden" name="date" value={d} /><input type="hidden" name="bin" value={b.bin} />
						<span>{fmt(d)} · {b.label}</span><button class="x" title={t('waste.deletePickup')} aria-label="{t('waste.deletePickup')}: {fmt(d)}">✕</button>
					</form>
				{/each}
			</div>
			<form method="POST" action="?/deleteManualBin" use:enhance class="inline">
				<input type="hidden" name="bin" value={b.bin} />
				<button class="danger" onclick={(e) => !confirm(t('guide.waste.deleteAllConfirm', { bin: b.label })) && e.preventDefault()}>{t('guide.waste.deleteAll', { bin: b.label })}</button>
			</form>
		</details>
	{:else}
		<p class="muted">{t('guide.waste.noManual')}</p>
	{/each}
	<form method="POST" action="?/addManualPickup" use:enhance class="row new manual">
		<label>{t('waste.pickupDay')} <input type="date" name="date" min={data.today} required /></label>
		<label>
			{t('waste.bin')}
			<select name="bin">{#each data.bins as b (b.bin)}<option value={b.bin}>{b.label}</option>{/each}</select>
		</label>
		<button class="primary">{t('waste.addPickup')}</button>
	</form>
	<p class="hint">
		{t('waste.manualHint')}
	</p>

	<details class="advanced">
		<summary><b>{t('waste.rules')}</b> <span class="muted">{t('guide.waste.advanced')}</span></summary>
		{#if msg(form, 'wasteRules')?.error}<p class="err">{msg(form, 'wasteRules')?.error}</p>{/if}
		{#if msg(form, 'wasteRules')?.ok}<p class="ok">{t('waste.rulesSaved')}</p>{/if}
		{#each data.clashes as c (c.member)}
			<p class="err">{t('waste.clash', { member: c.member, bin: c.bin })}</p>
		{/each}
		<form method="POST" action="?/saveWasteRules" use:enhance={noReset} class="rules">
			<table>
				<thead><tr><th>{t('waste.col.match')}</th><th>{t('waste.bin')}</th><th>{t('waste.col.id')}</th><th>{t('setup.members.color')}</th></tr></thead>
				{#key data.rules}
					<tbody>
						{#each data.rules as r, i (i)}
							<tr>
								<td><input name="match" value={r.match} aria-label={t('waste.col.match')} /></td>
								<td><input name="label" value={r.label} maxlength="40" aria-label={t('waste.bin')} /></td>
								<td><input name="bin" value={r.bin} maxlength="30" aria-label={t('waste.col.id')} /></td>
								<td><input type="color" name="color" value={r.color} aria-label={t('setup.members.color')} /></td>
							</tr>
						{/each}
						<tr class="new">
							<td><input name="match" placeholder={t('waste.matchPlaceholder')} aria-label="{t('waste.col.match')} ({t('waste.newRule')})" /></td>
							<td><input name="label" maxlength="40" placeholder={t('waste.newBin')} aria-label="{t('waste.bin')} ({t('waste.newRule')})" /></td>
							<td><input name="bin" maxlength="30" placeholder={t('waste.fromName')} aria-label="{t('waste.col.id')} ({t('waste.newRule')})" /></td>
							<td><input type="color" name="color" value="#7c7c7c" aria-label="{t('setup.members.color')} ({t('waste.newRule')})" /></td>
						</tr>
					</tbody>
				{/key}
			</table>
			<div class="actions">
				<button class="primary">{t('waste.saveRules')}</button>
				{#each data.presets as p (p)}
					<button formaction="?/loadWastePreset" name="preset" value={p} onclick={(e) => !confirm(t('waste.confirmPreset', { preset: p })) && e.preventDefault()}
						>{t('waste.loadPreset', { preset: p })}</button
					>
				{/each}
			</div>
		</form>
		<p class="hint">
			{data.custom ? t('waste.custom') : t('waste.preset')}
			{t('waste.rulesHint1')} <code>/rest(müll|abfall)/</code>. {t('waste.rulesHint2')}
		</p>
	</details>
</section>

<style>
	/* --- 26b: guides --- */
	.year {
		display: grid;
		gap: 10px;
		padding: 14px 16px;
		border-radius: 12px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
	}
	.year .row.new {
		padding: 0;
		border: 0;
		background: none;
	}
	.paste {
		display: grid;
		gap: 4px;
	}
	.paste textarea {
		font: 16px var(--font-body);
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--fg);
		width: 100%;
		box-sizing: border-box;
	}
	.year-preview {
		display: grid;
		gap: 6px;
	}
	.year-preview p {
		margin: 0;
	}
	.months {
		display: grid;
		gap: 4px;
	}
	.month {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.month .m {
		min-width: 9em;
		font-weight: 600;
		text-transform: capitalize;
	}
	.day {
		display: inline-grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 2px solid var(--c);
		font-variant-numeric: tabular-nums;
		font-size: 14px;
		font-weight: 600;
	}
	.day.hol {
		background: var(--alert);
		border-color: var(--alert);
		color: #fff;
	}
	.warn {
		color: var(--alert);
	}
	.bin-list {
		margin: 6px 0;
	}
	.bin-list summary {
		cursor: pointer;
		padding: 6px 0;
	}
	.bin-list .inline {
		margin: 6px 0 4px;
	}
	.advanced {
		margin-top: 24px;
	}
	.advanced summary {
		cursor: pointer;
		padding: 8px 0;
	}
</style>
