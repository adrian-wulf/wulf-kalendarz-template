<script lang="ts">
	import { enhance } from '$app/forms';
	import { ago, msg } from '#lib/components/admin/admin.svelte.js';
	import { presetOf } from '#lib/layout.js';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';
	// --- 26b: guides ---
	import Guide from '#lib/components/admin/Guide.svelte';
	import type { TextKey } from '#lib/i18n/index.js';

	let { data, form }: PageProps = $props();

	// Kolejność zmienia się tylko między modułami (rdzeń zawsze pierwszy).
	const movable = $derived(data.modules.filter((m) => !m.core));
	// Podgląd w proporcjach ekranu z „Układu ekranu” (pionowy – wąski i wysoki).
	const screen = $derived(data.layout.resolution === 'auto' ? presetOf(data.layout.preset)!.base : data.layout.resolution);

	// --- 26b: guides --- „Co jeszcze możesz podłączyć”
	const tips = $derived(data.tips);
	const shown = $derived(tips.items.filter((i) => !i.dismissed));
	const hiddenCount = $derived(tips.items.length - shown.length);
	const allDone = $derived(tips.total > 0 && tips.done === tips.total);
	let showDone = $state(false);
	const tk = (id: string, part: string) => `tips.${id}.${part}` as TextKey;
</script>

<!-- --- 26b: guides --- -->
<section id="start" class="adm-sec checklist" data-testid="checklist">
	<h2>{t('tips.title')}</h2>
	{#if msg(form, 'tips')?.error}<p class="err">{msg(form, 'tips')?.error}</p>{/if}
	<div class="progress">
		<progress value={tips.done} max={Math.max(1, tips.total)} aria-label={t('tips.title')}></progress>
		<span data-testid="checklist-progress">{t('tips.progress', { done: tips.done, total: tips.total })}</span>
	</div>
	{#if allDone && !showDone}
		<p class="ok">✓ {t('tips.allDone')} <button type="button" class="linkish" onclick={() => (showDone = true)}>{t('tips.showList')}</button></p>
	{:else}
		<ul class="tips">
			{#each shown as it (it.id)}
				<li class="tip {it.state}" data-tip={it.id} data-state={it.state}>
					<span class="mark" aria-hidden="true">{it.state === 'done' ? '✓' : it.state === 'started' ? '◐' : it.state === 'unknown' ? '›' : '○'}</span>
					<div class="grow">
						<b>{t(tk(it.id, 'title'))}</b>
						<span class="sr">{it.state === 'done' ? t('tips.state.done') : it.state === 'started' ? t('tips.state.started') : it.state === 'todo' ? t('tips.state.todo') : ''}</span>
						<div class="muted">{it.state === 'started' ? t(tk(it.id, 'started')) : t(tk(it.id, 'desc'))}</div>
					</div>
					<a class="button" class:primary={it.state === 'todo' || it.state === 'started'} href={it.href}>{it.state === 'done' || it.state === 'unknown' ? t('tips.open') : it.state === 'started' ? t('tips.finish') : t('tips.setup')} ›</a>
					{#if it.state !== 'done'}
						<form method="POST" action="?/dismissTip" use:enhance>
							<input type="hidden" name="id" value={it.id} />
							<button class="quiet" aria-label={t('tips.dismissLabel', { name: t(tk(it.id, 'title')) })}>{t('tips.dismiss')}</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if hiddenCount}
		<form method="POST" action="?/restoreTips" use:enhance class="restore">
			<button class="quiet">{t('tips.restore', { n: hiddenCount })}</button>
		</form>
	{/if}
</section>

<section id="podglad" class="adm-sec">
	<h2>{t('admin.livePreview')}</h2>
	<div class="preview" style:aspect-ratio="{screen.w} / {screen.h}" style:width={screen.h > screen.w ? `${Math.round((620 * screen.w) / screen.h)}px` : undefined}>
		<iframe src="/" title={t('admin.kioskPreview')}></iframe>
	</div>
</section>

<section id="moduly" class="adm-sec">
	<h2>{t('setup.step.modules')}</h2>
	<!-- --- 26b: guides --- -->
	<Guide id="modules" ctx={data.guide.ctx} params={data.guide.params} />
	{#if msg(form, 'modules')?.error}<p class="err">{msg(form, 'modules')?.error}</p>{/if}
	{#each data.warnings as w (w)}<p class="err">{w}</p>{/each}
	<div class="rows">
		{#each data.modules as m (m.id)}
			{@const i = movable.findIndex((x) => x.id === m.id)}
			<div class="row item module" class:off={!m.active} data-module={m.id}>
				<span class="micon" aria-hidden="true">{m.icon}</span>
				<div class="grow">
					<b>{m.name}</b>
					{#if m.core}<span class="pill">{t('admin.mod.always')}</span>{:else if m.active}<span class="pill good">{t('admin.mod.on')}</span>{:else if m.enabled}<span class="pill bad"
							>{t('admin.mod.missing')}</span
						>{:else}<span class="pill">{t('admin.mod.off')}</span>{/if}
					<div class="muted desc">
						{m.description}
						{#if m.requires.length}{t('admin.mod.requires', { list: m.requires.join(', ') })}{/if}
						{#if m.active && m.dependents.length}{t('admin.mod.dependents', { list: m.dependents.join(', ') })}{/if}
					</div>
				</div>
				{#if m.section && m.active}<a class="button" href="/admin/{m.section}">{t('admin.mod.settings')} ›</a>{/if}
				{#if !m.core}
					<form method="POST" action="?/moveModule" use:enhance class="inline">
						<input type="hidden" name="id" value={m.id} />
						<button name="dir" value="up" disabled={i === 0} title={t('admin.up')} aria-label={t('admin.moveUp', { name: m.name })}>↑</button>
						<button name="dir" value="down" disabled={i === movable.length - 1} title={t('admin.down')} aria-label={t('admin.moveDown', { name: m.name })}>↓</button>
					</form>
					<form method="POST" action="?/toggleModule" use:enhance class="inline">
						<input type="hidden" name="id" value={m.id} />
						{#if m.enabled}
							<button
								name="enabled"
								value="0"
								class="danger"
								onclick={(e) => m.dependents.length && m.active && !confirm(t('admin.mod.confirmOff', { name: m.name, list: m.dependents.join(', ') })) && e.preventDefault()}
								>{t('admin.mod.disable')}</button
							>
						{:else}
							<button name="enabled" value="1" class="primary">{t('admin.mod.enable')}</button>
						{/if}
					</form>
				{/if}
			</div>
		{/each}
	</div>
	<p class="hint">{t('admin.mod.hint')}</p>
</section>

<section id="status" class="adm-sec">
	<h2>{t('admin.status.title')}</h2>
	{#if msg(form, 'status')?.error}<p class="err">{msg(form, 'status')?.error}</p>{/if}
	<table>
		<thead><tr><th>{t('admin.status.source')}</th><th>{t('admin.status.state')}</th><th>{t('admin.status.fetched')}</th><th>{t('common.error')}</th><th></th></tr></thead>
		<tbody>
			{#each data.sources as s (s.name)}
				<tr>
					<td>{s.label}</td>
					<td><span class="pill" class:good={s.ok} class:bad={!s.ok && s.fetchedAt} class:off={!s.fetchedAt && !s.error}>{s.ok ? t('common.ok') : s.error ? t('common.error') : t('admin.status.notConfigured')}</span></td>
					<td>{ago(s.fetchedAt)}</td>
					<td class="muted">{s.error ?? ''}</td>
					<td>
						<form method="POST" action="?/refresh" use:enhance><input type="hidden" name="name" value={s.name} /><button>{t('admin.status.refresh')}</button></form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p><a class="button" href="/admin/backup" download>⬇ {t('admin.backup')}</a> <a class="button" href="/admin/kopie">{t('p4.backup.title')}</a></p>
</section>

{#if !data.demo}
	<section id="przyklad" class="adm-sec">
		<h2>{t('admin.sample.title')}</h2>
		{#if msg(form, 'sample')?.error}<p class="err">{msg(form, 'sample')?.error}</p>{/if}
		{#if form?.section === 'sample' && 'added' in form && form.added}
			<p class="ok">{t('admin.sample.done', { members: form.added.members, events: form.added.events, items: form.added.items })}</p>
		{/if}
		<form method="POST" action="?/loadSampleData" use:enhance class="row item">
			<div class="grow muted">{t('admin.sample.text')}</div>
			{#if data.sample.loaded}
				<span class="pill">{t('admin.sample.loaded')}</span>
			{:else}
				<button data-testid="load-sample" onclick={(e) => !confirm(t('admin.sample.confirm')) && e.preventDefault()}>{t('admin.sample.button')}</button>
			{/if}
		</form>
	</section>

	<section id="kreator" class="adm-sec">
	<h2>{t('admin.wizard.title')}</h2>
	<form method="POST" action="?/restartSetup" class="row item">
		<div class="grow muted">{t('admin.wizard.text')}</div>
		<button onclick={(e) => !confirm(t('admin.wizard.confirm')) && e.preventDefault()}>{t('admin.wizard.run')}</button>
	</form>
</section>
{/if}

<style>
	/* --- 26b: guides --- */
	.checklist .progress {
		display: flex;
		align-items: center;
		gap: 12px;
		font-weight: 700;
	}
	.checklist progress {
		width: min(320px, 60%);
		height: 10px;
		accent-color: #1f8a4c;
	}
	.tips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.tip {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-radius: 10px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.tip .mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--line);
		font-weight: 700;
	}
	.tip.done .mark {
		background: #1f8a4c;
		border-color: #1f8a4c;
		color: #fff;
	}
	.tip.started .mark {
		border-color: var(--accent, var(--fg));
	}
	.tip.done b {
		color: var(--muted);
	}
	.tip form {
		display: contents;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.adm-sec .quiet,
	.linkish {
		background: none;
		border: 0;
		padding: 6px 4px;
		color: var(--muted);
		font: 600 14px var(--font-body);
		text-decoration: underline;
		cursor: pointer;
	}
	.restore {
		margin-top: 4px;
	}
	@media (max-width: 700px) {
		.tip {
			flex-wrap: wrap;
		}
		.tip .grow {
			flex: 1 1 calc(100% - 44px);
		}
	}
	.module {
		flex-wrap: nowrap;
	}
	.module.off {
		opacity: 0.75;
	}
	.micon {
		font-size: 28px;
		width: 40px;
		text-align: center;
		flex: none;
	}
	.desc {
		font-size: 14px;
		margin-top: 2px;
	}
	.module :global(.pill) {
		margin-left: 6px;
	}
	.inline {
		display: flex;
		gap: 6px;
	}
	@media (max-width: 700px) {
		.module {
			flex-wrap: wrap;
		}
	}
</style>
