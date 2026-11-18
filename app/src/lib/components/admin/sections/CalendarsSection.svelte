<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago, keep, msg, noReset, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import MemberSelect from '../MemberSelect.svelte';
	import LayerStyle from '../LayerStyle.svelte';
	import CalendarGuide from '../CalendarGuide.svelte';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { calendarsSection } from '#lib/server/calendars-section.js';
	import type { IcsPreview } from '#lib/server/ics-import.js';
	import { fmtDayMonth, fmtShortDate, fmtTime } from '#lib/format.js';
	import { t, tn, type TextKey } from '#lib/i18n/index.js';

	type Form = ActionResult & { preview?: IcsPreview; imported?: { added: number; updated: number }; added?: string };
	let { data, form }: { data: AdminDataOf<typeof calendarsSection> & { members: AdminMember[]; today: string }; form: Form } = $props();

	const KIND: Record<string, TextKey> = {
		google: 'cal.kind.google',
		local: 'cal.kind.local',
		ical: 'cal.kind.ical',
		birthdays: 'cal.kind.generated',
		waste: 'cal.kind.generated',
		ferien: 'cal.kind.generated',
		holidays: 'cal.kind.generated'
	};
	const memberName = (id: string | null) => data.members.find((m) => m.id === id)?.name;
	const refreshLabel = (min: number) => (min < 60 ? tn('cal.refresh.min', min) : min < 1440 ? tn('cal.refresh.hours', min / 60) : t('cal.refresh.day'));

	const preview = $derived(form?.section === 'calendarsImport' ? form.preview : undefined);
	const imported = $derived(form?.section === 'calendarsImport' ? form.imported : undefined);
	let target = $state('new');
	const willUpdate = $derived(preview && target !== 'new' ? (preview.existing[target] ?? 0) : 0);
	const when = (s: { start: string; allDay: boolean }) => (s.allDay ? fmtShortDate(s.start) : `${fmtShortDate(s.start.slice(0, 10))} ${fmtTime(s.start)}`);
	/** Przełącznik zapisuje od razu – bez szukania przycisku „Zapisz”. */
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();
</script>

<section id="kalendarze" class="adm-sec cals-sec">
	<h2>{t('cal.title')}</h2>
	<p class="lead">{t('cal.lead')}</p>
	{#if msg(form, 'calendars')?.error}<p class="err" role="alert">{msg(form, 'calendars')?.error}</p>{/if}

	<div class="layers" data-testid="calendar-layers">
		<div class="head" aria-hidden="true">
			<span></span><span>{t('cal.col.calendar')}</span><span>{t('cal.col.kiosk')}</span><span>{t('cal.col.phone')}</span><span></span>
		</div>
		{#each data.calendars as c, i (c.id)}
			<article class="layer" class:off={!c.showKiosk && !c.showPhone} style:--c={c.swatch ?? 'var(--accent)'} data-calendar={c.id}>
				<span class="mark" class:dot={!c.icon} aria-hidden="true">{c.icon}</span>
				<div class="what">
					<b>{c.name}</b>
					<small>
						{[t(KIND[c.kind]), memberName(c.memberId), c.kind === 'ical' && c.refreshMinutes ? refreshLabel(c.refreshMinutes) : null, c.count !== null ? tn('cal.events', c.count) : null]
							.filter(Boolean)
							.join(' · ')}
					</small>
					{#if c.status}
						{#if c.status.ok}<small class="good">✓ {t('cal.status.ok', { when: ago(c.status.fetchedAt) })}</small>
						{:else}<small class="bad" role="status">{c.status.error ?? t('cal.status.waiting')}</small>{/if}
					{/if}
				</div>
				<form method="POST" action="?/toggleCalendar" use:enhance={keep} class="tg">
					<input type="hidden" name="id" value={c.id} /><input type="hidden" name="surface" value="kiosk" /><input type="hidden" name="on" value={c.showKiosk ? '0' : '1'} />
					<button class="switch" role="switch" aria-checked={c.showKiosk} aria-label="{t('cal.col.kiosk')}: {c.name}" data-surface="kiosk"><span class="knob"></span><span class="lbl">{t('cal.col.kiosk')}</span></button>
				</form>
				<form method="POST" action="?/toggleCalendar" use:enhance={keep} class="tg">
					<input type="hidden" name="id" value={c.id} /><input type="hidden" name="surface" value="phone" /><input type="hidden" name="on" value={c.showPhone ? '0' : '1'} />
					<button class="switch" role="switch" aria-checked={c.showPhone} aria-label="{t('cal.col.phone')}: {c.name}" data-surface="phone"><span class="knob"></span><span class="lbl">{t('cal.col.phone')}</span></button>
				</form>
				<div class="order">
					<form method="POST" action="?/moveCalendar" use:enhance={keep}>
						<input type="hidden" name="id" value={c.id} />
						<button name="dir" value="up" disabled={i === 0} title={t('admin.up')} aria-label="{t('admin.up')}: {c.name}">↑</button>
						<button name="dir" value="down" disabled={i === data.calendars.length - 1} title={t('admin.down')} aria-label="{t('admin.down')}: {c.name}">↓</button>
					</form>
				</div>
				<details class="edit">
					<summary>{t('cal.edit')}</summary>
					<form method="POST" action="?/saveCalendar" use:enhance={keep} class="row editform">
						<input type="hidden" name="id" value={c.id} />
						<label class="grow">{t('cal.field.name')} <input name="name" value={c.name} maxlength="60" required={c.removable} /></label>
						{#if c.memberFromGoogle}
							<p class="hint grow">{t('cal.memberFromGoogle', { member: memberName(c.memberId) ?? '' })}</p>
						{:else}
							<MemberSelect members={data.members} selected={c.memberId} />
						{/if}
						{#if c.kind === 'ical'}
							<label>{t('cal.field.refresh')}
								<select name="refreshMinutes" value={String(c.refreshMinutes)}>
									{#each data.refreshChoices as r (r)}<option value={String(r)}>{refreshLabel(r)}</option>{/each}
								</select>
							</label>
							<p class="hint url">{t('cal.field.url')}: <code>{c.url}</code></p>
						{/if}
						<label class="check"><input type="checkbox" name="showKiosk" checked={c.showKiosk} /> {t('cal.showKiosk')}</label>
						<label class="check"><input type="checkbox" name="showPhone" checked={c.showPhone} /> {t('cal.showPhone')}</label>
						{#if c.kind === 'waste'}<p class="hint grow">{t('cal.wasteColors')}</p>{/if}
						<LayerStyle color={c.color} icon={c.icon} palette={data.palette} icons={data.icons} autoSwatch={data.members.find((m) => m.id === c.memberId)?.color ?? null} />
						<div class="btns">
							<button class="primary">{t('common.save')}</button>
							{#if c.kind === 'ical'}<button formaction="?/refreshSubscription" formnovalidate>{t('cal.refreshNow')}</button>{/if}
							{#if c.removable}
								<button formaction="?/deleteCalendar" formnovalidate class="danger" onclick={(e) => !confirm(c.kind === 'local' ? t('cal.confirmDeleteLocal', { name: c.name, n: c.count ?? 0 }) : t('cal.confirmDelete', { name: c.name })) && e.preventDefault()}
									>{t('cal.delete')}</button
								>
							{/if}
						</div>
					</form>
				</details>
			</article>
		{/each}
	</div>
	<p class="hint">{t('cal.colorsRule')}</p>

	<h3>{t('cal.add.title')}</h3>
	<div class="adders">
		<div class="card" id="subskrypcja">
			<h4>🔗 {t('cal.sub.title')}</h4>
			<p class="hint">{t('cal.sub.what')}</p>
			<CalendarGuide topic="subscribe" />
			{#if msg(form, 'calendarsAdd')?.error}<p class="err" role="alert">{msg(form, 'calendarsAdd')?.error}</p>{/if}
			{#if msg(form, 'calendarsAdd')?.ok}<p class="ok" role="status">{t('cal.sub.added')}</p>{/if}
			<form method="POST" action="?/addSubscription" use:enhance class="row new stack" data-testid="add-subscription">
				<label class="grow">{t('cal.field.url')} <input name="url" type="text" inputmode="url" required placeholder="https://… .ics / webcal://…" autocomplete="off" /></label>
				<label class="grow">{t('cal.field.name')} <input name="name" required maxlength="60" placeholder={t('cal.sub.namePh')} /></label>
				<MemberSelect members={data.members} selected={null} />
				<label>{t('cal.field.refresh')}
					<select name="refreshMinutes" value="60">
						{#each data.refreshChoices as r (r)}<option value={String(r)}>{refreshLabel(r)}</option>{/each}
					</select>
				</label>
				<LayerStyle color={data.suggestedColor} icon="📅" palette={data.palette} icons={data.icons} allowAuto={false} />
				<div class="btns"><button class="primary">{t('cal.sub.add')}</button></div>
			</form>
			{#if data.demo}<p class="hint">{t('cal.sub.demo')}</p>{/if}
		</div>

		<div class="card" id="import">
			<h4>📥 {t('cal.imp.title')}</h4>
			<p class="hint">{t('cal.imp.what')}</p>
			<CalendarGuide topic="export" />
			{#if msg(form, 'calendarsImport')?.error}<p class="err" role="alert">{msg(form, 'calendarsImport')?.error}</p>{/if}
			{#if imported}
				<p class="ok" role="status" data-testid="import-done">{t('cal.imp.done', { added: imported.added, updated: imported.updated })}</p>
			{/if}
			{#if preview}
				<div class="imp-preview" data-testid="import-preview">
					<p class="step">{t('cal.imp.step2')}</p>
					<p>
						<b>{preview.fileName}</b>: {tn('cal.imp.count', preview.total)}{#if preview.from && preview.to}
							{' '}{t('cal.imp.range', { from: fmtDayMonth(preview.from), to: fmtDayMonth(preview.to) })}{/if}.
						{#if preview.recurring}{tn('cal.imp.recurring', preview.recurring)}{/if}
					</p>
					{#if preview.past || preview.broken}
						<p class="hint">
							{#if preview.past}{tn('cal.imp.past', preview.past)}{/if}
							{#if preview.broken}{tn('cal.imp.broken', preview.broken)}{/if}
						</p>
					{/if}
					<ul class="sample">
						{#each preview.sample as s, i (i)}<li><span class="when">{when(s)}</span> {s.title}</li>{/each}
						{#if preview.total > preview.sample.length}<li class="muted">{t('common.more', { n: preview.total - preview.sample.length })}</li>{/if}
					</ul>
					<form method="POST" action="?/importIcs" use:enhance={noReset} class="row new stack">
						<input type="hidden" name="token" value={preview.token} />
						<label class="grow">{t('cal.imp.target')}
							<select name="target" bind:value={target}>
								<option value="new">{t('cal.imp.newCal')}</option>
								{#each data.localTargets as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
							</select>
						</label>
						{#if target === 'new'}
							<label class="grow">{t('cal.field.name')} <input name="name" required maxlength="60" value={preview.suggestedName} /></label>
							<MemberSelect members={data.members} selected={null} />
							<LayerStyle color={data.suggestedColor} icon="🏫" palette={data.palette} icons={data.icons} allowAuto={false} />
						{:else if willUpdate}
							<p class="hint grow">{tn('cal.imp.willUpdate', willUpdate)}</p>
						{/if}
						<div class="btns">
							<button class="primary">{tn('cal.imp.go', preview.total)}</button>
							<a class="button" href="?">{t('common.cancel')}</a>
						</div>
					</form>
				</div>
			{:else}
				<form method="POST" action="?/previewIcs" enctype="multipart/form-data" use:enhance class="row new" data-testid="import-file">
					<p class="step">{t('cal.imp.step1')}</p>
					<label class="grow">{t('cal.imp.file')} <input type="file" name="file" accept=".ics,text/calendar" required /></label>
					<button class="primary">{t('cal.imp.check')}</button>
				</form>
			{/if}
		</div>

		<div class="card" id="google-rodzina">
			<h4>👪 {t('cal.fam.title')}</h4>
			<p class="hint">{data.googleConnected ? (data.googleFamily ? t('cal.fam.connected') : t('cal.fam.noFamily')) : t('cal.fam.notConnected')}</p>
			<CalendarGuide topic="google" />
			<p><a class="button" href="/admin/google">{t('cal.fam.open')}</a></p>
		</div>
	</div>

	<h3>{t('cal.kioskTitle')}</h3>
	<p class="hint">{t('cal.kioskHint')}</p>
	{#if msg(form, 'calendarsLock')?.ok}<p class="ok">{t('admin.saved')}.</p>{/if}
	<form method="POST" action="?/saveCalendarLock" use:enhance={noReset} class="row">
		<label class="check grow"><input type="checkbox" name="locked" checked={data.locked} onchange={submitOnChange} /> {t('cal.lock')}</label>
		<noscript><button>{t('common.save')}</button></noscript>
	</form>
</section>

<style>
	.lead {
		max-width: 70ch;
		margin: 0 0 16px;
		font-size: 16px;
		line-height: 1.5;
	}
	.layers {
		display: grid;
		gap: 8px;
	}
	.head {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 110px 110px 90px;
		gap: 12px;
		padding: 0 14px;
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
	}
	.layer {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 110px 110px 90px;
		gap: 6px 12px;
		align-items: center;
		background: var(--card);
		border: 1px solid var(--line);
		border-left: 6px solid var(--c);
		border-radius: 10px;
		padding: 10px 14px;
	}
	.layer.off .what b {
		color: var(--muted);
	}
	.mark {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 20px;
		background: color-mix(in srgb, var(--c) 18%, var(--card));
	}
	.mark.dot::after {
		content: '';
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--c);
	}
	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.what b {
		font-size: 17px;
		overflow-wrap: anywhere;
	}
	.what small {
		color: var(--muted);
		font-size: 13px;
	}
	.what small.good {
		color: #1f8a4c;
	}
	.what small.bad {
		color: var(--alert);
		font-weight: 600;
	}
	.tg {
		display: contents;
	}
	.switch {
		display: inline-flex !important;
		align-items: center;
		gap: 8px;
		padding: 6px 10px !important;
		border-radius: 999px !important;
		background: var(--bg) !important;
		font-size: 14px !important;
		justify-self: start;
	}
	.switch .knob {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: var(--line);
		flex: none;
		transition: background 0.15s;
	}
	.switch .knob::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		transition: transform 0.15s;
	}
	.switch[aria-checked='true'] .knob {
		background: #1f8a4c;
	}
	.switch[aria-checked='true'] .knob::after {
		transform: translateX(16px);
	}
	.switch .lbl {
		display: none;
	}
	.order form {
		display: flex;
		gap: 4px;
	}
	.order button {
		padding: 6px 10px !important;
	}
	.edit {
		grid-column: 2 / -1;
	}
	.edit summary {
		cursor: pointer;
		color: var(--muted);
		font-size: 14px;
		font-weight: 600;
		width: max-content;
	}
	.editform {
		margin-top: 8px;
		border-left-width: 1px !important;
		background: var(--bg) !important;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex: 1 1 100%;
	}
	.url code {
		overflow-wrap: anywhere;
	}
	.adders {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 16px;
		align-items: start;
	}
	.card {
		display: grid;
		gap: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 16px;
		min-width: 0;
	}
	.card h4 {
		margin: 0;
		font-size: 18px;
	}
	.card p {
		margin: 0;
	}
	.stack {
		background: var(--bg) !important;
	}
	.step {
		flex: 1 1 100%;
		font-weight: 700;
		margin: 0;
	}
	.imp-preview {
		display: grid;
		gap: 8px;
		border: 2px solid var(--accent);
		border-radius: 10px;
		padding: 12px;
	}
	.sample {
		margin: 0;
		padding-left: 18px;
		font-size: 14px;
		display: grid;
		gap: 2px;
	}
	.sample .when {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	@media (max-width: 760px) {
		.head {
			display: none;
		}
		.layer {
			grid-template-columns: 40px auto auto minmax(0, 1fr);
		}
		.what {
			grid-column: 2 / 4;
		}
		.switch[data-surface='kiosk'] {
			grid-column: 2;
		}
		.switch[data-surface='phone'] {
			grid-column: 3;
		}
		.order {
			grid-column: 4;
			grid-row: 1;
		}
		.switch .lbl {
			display: inline;
		}
		.order {
			justify-self: end;
		}
		.edit {
			grid-column: 1 / -1;
		}
	}
</style>
