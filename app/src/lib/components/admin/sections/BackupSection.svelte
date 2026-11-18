<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { keep, msg, noReset, type ActionResult } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { backups } from '#lib/server/backup-admin.js';
	import { localZone } from '#lib/logic/dates.js';
	import { locale, t } from '#lib/i18n/index.js';
	// --- 26b: guides ---
	import EmptyState from '../EmptyState.svelte';

	type Form = ActionResult & { target?: string; files?: { name: string; size: number; modified: string | null }[]; restored?: boolean; before?: string };
	let { data, form }: { data: AdminDataOf<typeof backups>; form: Form } = $props();

	const b = $derived(data.backup);
	// --- 26b: guides --- kopia poza tym komputerem (Nextcloud, NAS, zamontowany folder)
	const away = $derived(b.targets.some((tg) => tg.enabled && (tg.kind === 'webdav' || !!tg.path)));
	let freq = $derived(b.freq);
	let newKind = $state<'local' | 'webdav'>('webdav');
	let uploading = $state<number | null>(null);
	let uploadError = $state<string | null>(null);

	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) => ({ value: i + 1, label: new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))) }))
	);
	const when = (iso: string | null | undefined) =>
		iso ? new Intl.DateTimeFormat(locale(), { timeZone: localZone(), dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';
	const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
	const listed = (id: string) => (form?.section === 'backupList' && form.target === id ? form : null);
	const confirmDelete = (e: MouseEvent) => !confirm(t('p4.backup.deleteConfirm')) && e.preventDefault();
	const confirmRestore = (e: MouseEvent) => !confirm(t('p4.backup.restoreConfirm')) && e.preventDefault();

	const CHUNK = 8 * 1024 * 1024;

	/** Wgrywanie w kawałkach (limit jednego żądania), potem sprawdzenie kopii akcją `backupPrepare`. */
	async function upload(e: SubmitEvent) {
		e.preventDefault();
		const el = e.currentTarget as HTMLFormElement;
		const file = (el.elements.namedItem('file') as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadError = null;
		const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
		try {
			for (let off = 0; off === 0 || off < file.size; off += CHUNK) {
				uploading = file.size ? Math.round((off / file.size) * 100) : 0;
				const r = await fetch('/admin/backup/upload', {
					method: 'POST',
					headers: { 'content-type': 'application/octet-stream', 'x-upload-id': id, 'x-upload-offset': String(off) },
					body: file.slice(off, off + CHUNK)
				});
				if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? r.statusText);
			}
			uploading = 100;
			const fd = new FormData();
			fd.set('upload', id);
			fd.set('filename', file.name);
			fd.set('passphrase', String(new FormData(el).get('passphrase') ?? ''));
			const res = await fetch('?/backupPrepare', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			await applyAction(result);
			if (result.type === 'success') {
				el.reset();
				await invalidateAll();
			}
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = null;
		}
	}
</script>

{#snippet status(s: (typeof b.targets)[number]['status'])}
	{#if !s}
		<span class="pill off">{t('p4.backup.never')}</span>
	{:else if s.ok}
		<span class="pill good">{t('common.ok')}</span> <span class="muted">{when(s.at)}{s.size ? ` · ${mb(s.size)}` : ''}</span>
	{:else}
		<span class="pill bad">{t('common.error')}</span> <span class="muted">{when(s.at)}</span>
	{/if}
{/snippet}

{#snippet files(target: string, list: { name: string; size: number; modified: string | null }[], local: boolean)}
	{#if list.length}
		<table class="files">
			<tbody>
				{#each list as f (f.name)}
					<tr>
						<td><code>{f.name}</code></td>
						<td class="muted num">{mb(f.size)}</td>
						<td class="actions-cell">
							{#if local}<a class="button" href="/admin/backup/{target}/{f.name}" download>{t('p4.backup.download')}</a>{/if}
							<form method="POST" action="?/backupPrepare" use:enhance={noReset} class="inline">
								<input type="hidden" name="target" value={target} />
								<input type="hidden" name="name" value={f.name} />
								{#if f.name.endsWith('.enc') && !b.encrypted}
									<input name="passphrase" type="password" autocomplete="off" required placeholder={t('p4.backup.passphrase')} aria-label={t('p4.backup.passphrase')} />
								{/if}
								<button disabled={!!b.pending}>{t('p4.backup.restoreFrom')}</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="muted">{t('p4.backup.noFiles')}</p>
	{/if}
{/snippet}

<section id="kopie" class="adm-sec">
	<h2>{t('p4.backup.title')}</h2>
	<p class="hint">{t('p4.backup.intro')}</p>
	{#if !away}
		<EmptyState testid="backup-empty" title={t('empty.backup.title')} text={t('empty.backup.text')} href="#dodaj-miejsce" action={t('empty.backup.action')} />
	{/if}
	{#if b.disk}
		{@const gb = (n: number) => `${(n / 1024 ** 3).toLocaleString(locale(), { maximumFractionDigits: 1 })} GB`}
		<p class:muted={!b.disk.low} class:err={b.disk.low} data-testid="disk-free">
			{t('p4.backup.diskFree', { free: gb(b.disk.free), total: gb(b.disk.total) })}{#if b.disk.low}<br />⚠ {t('p4.backup.diskLow')}{/if}
		</p>
	{/if}

	<div class="now">
		<p class="last">
			{#if b.lastRun}
				{t('p4.backup.lastRun')}: <strong>{when(b.lastRun.at)}</strong>
				<span class="pill" class:good={b.lastRun.ok} class:bad={!b.lastRun.ok}>{b.lastRun.ok ? t('common.ok') : t('common.error')}</span>
				<span class="muted">({b.lastRun.reason === 'auto' ? t('p4.backup.reasonAuto') : t('p4.backup.reasonManual')})</span>
			{:else}
				{t('p4.backup.lastRun')}: <span class="muted">{t('p4.backup.never')}</span>
			{/if}
		</p>
		{#if msg(form, 'backupRun')?.error}<p class="err">{msg(form, 'backupRun')?.error}</p>{/if}
		{#if msg(form, 'backupRun')?.ok}<p class="ok">✓ {t('p4.backup.done')}</p>{/if}
		<form method="POST" action="?/backupNow" use:enhance={noReset} class="row">
			{#if !b.encrypted}
				<label class="grow">{t('p4.backup.oncePassphrase')} <input name="passphrase" type="password" autocomplete="new-password" placeholder={t('p4.backup.oncePlaceholder')} /></label>
			{/if}
			<button class="primary" disabled={!!b.busy}>{b.busy ? t('p4.backup.running') : t('p4.backup.now')}</button>
			<a class="button" href="/admin/backup" download>{t('p4.backup.downloadNew')}</a>
		</form>
	</div>

	<h3>{t('p4.backup.schedule')}</h3>
	{#if msg(form, 'backupSchedule')?.error}<p class="err">{msg(form, 'backupSchedule')?.error}</p>{/if}
	{#if msg(form, 'backupSchedule')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	<form method="POST" action="?/backupSchedule" use:enhance={noReset} class="row">
		<label
			>{t('p4.backup.freq')}
			<select name="freq" bind:value={freq}>
				<option value="daily">{t('p4.backup.daily')}</option>
				<option value="weekly">{t('p4.backup.weekly')}</option>
				<option value="off">{t('p4.backup.off')}</option>
			</select>
		</label>
		{#if freq === 'weekly'}
			<label
				>{t('p4.backup.weekday')}
				<select name="weekday" value={b.weekday}>
					{#each weekdays as d (d.value)}<option value={d.value}>{d.label}</option>{/each}
				</select>
			</label>
		{/if}
		<label>{t('p4.backup.time')} <input type="time" name="time" value={b.time} required disabled={freq === 'off'} /></label>
		{#if freq === 'off'}<input type="hidden" name="time" value={b.time} />{/if}
		<button class="primary">{t('common.save')}</button>
	</form>

	<h3>{t('p4.backup.targets')}</h3>
	<p class="hint">{t('p4.backup.targetsHint')}</p>
	{#if msg(form, 'backupTarget')?.error}<p class="err">{msg(form, 'backupTarget')?.error}</p>{/if}
	{#if msg(form, 'backupTarget')?.ok}<p class="ok">✓ {t('admin.saved')}</p>{/if}
	{#each b.targets as tg (tg.id)}
		<article class="target" data-testid="target-{tg.kind}">
			<header>
				<strong>{tg.label}</strong>
				<span class="kind">{tg.kind === 'local' ? t('p4.backup.kindLocal') : 'WebDAV'}</span>
				{#if !tg.enabled}<span class="pill off">{t('p4.backup.disabled')}</span>{/if}
				<span class="st">{@render status(tg.status)}</span>
			</header>
			{#if tg.status && !tg.status.ok && tg.status.error}<p class="err small">{tg.status.error}</p>{/if}
			<form method="POST" action="?/backupSaveTarget" use:enhance={keep} class="row">
				<input type="hidden" name="id" value={tg.id} />
				<input type="hidden" name="enabledField" value="1" />
				<label class="check"><input type="checkbox" name="enabled" checked={tg.enabled} /> {t('p4.backup.enabled')}</label>
				<label>{t('p4.backup.name')} <input name="name" value={tg.name} maxlength="40" placeholder={tg.label} /></label>
				{#if tg.kind === 'local'}
					<label class="grow">{t('p4.backup.path')} <input name="path" value={tg.path} placeholder={b.defaultDir} /></label>
				{:else}
					<label class="grow">{t('p4.backup.url')} <input name="url" type="url" value={tg.url} required /></label>
					<label>{t('p4.backup.user')} <input name="user" value={tg.user} required autocomplete="off" /></label>
					<label
						>{t('p4.backup.password')}
						<input name="password" type="password" autocomplete="new-password" placeholder={tg.hasPassword ? t('p4.backup.passwordKept') : ''} required={!tg.hasPassword} />
					</label>
				{/if}
				<label>{t('p4.backup.keep')} <input name="keep" type="number" min="1" max="365" value={tg.keep} class="short" /></label>
				<button class="primary">{t('common.save')}</button>
				<button formaction="?/backupTestTarget" formnovalidate>{t('p4.backup.test')}</button>
				<button formaction="?/backupDeleteTarget" formnovalidate class="danger" onclick={confirmDelete}>{t('common.delete')}</button>
			</form>
			{#if tg.kind === 'local'}
				<details class="list">
					<summary>{t('p4.backup.files', { n: tg.files?.length ?? 0 })}</summary>
					{@render files(tg.id, tg.files ?? [], true)}
				</details>
			{:else}
				<form method="POST" action="?/backupList" use:enhance={noReset} class="inline">
					<input type="hidden" name="id" value={tg.id} />
					<button>{t('p4.backup.showFiles')}</button>
				</form>
				{#if listed(tg.id)?.error}<p class="err small">{listed(tg.id)?.error}</p>{/if}
				{#if listed(tg.id)?.files}{@render files(tg.id, listed(tg.id)?.files ?? [], false)}{/if}
			{/if}
		</article>
	{/each}

	{#if b.targets.length < b.maxTargets}
		<details class="add" id="dodaj-miejsce" open={!b.targets.length || !away}>
			<summary>{t('p4.backup.add')}</summary>
			<form method="POST" action="?/backupSaveTarget" use:enhance={noReset} class="row">
				<label
					>{t('p4.backup.kind')}
					<select name="kind" bind:value={newKind}>
						<option value="webdav">{t('p4.backup.kindWebdav')}</option>
						<option value="local">{t('p4.backup.kindLocal')}</option>
					</select>
				</label>
				<label>{t('p4.backup.name')} <input name="name" maxlength="40" placeholder={newKind === 'local' ? 'NAS' : 'Nextcloud'} /></label>
				{#if newKind === 'local'}
					<label class="grow">{t('p4.backup.path')} <input name="path" required placeholder="/backup" /></label>
				{:else}
					<label class="grow">{t('p4.backup.url')} <input name="url" type="url" required placeholder="https://cloud.example.com/remote.php/dav/files/USER/Kopie/kalendarz/" /></label>
					<label>{t('p4.backup.user')} <input name="user" required autocomplete="off" /></label>
					<label>{t('p4.backup.password')} <input name="password" type="password" required autocomplete="new-password" /></label>
				{/if}
				<label>{t('p4.backup.keep')} <input name="keep" type="number" min="1" max="365" value="14" class="short" /></label>
				<button class="primary">{t('p4.backup.addButton')}</button>
			</form>
			<p class="hint">{newKind === 'local' ? t('p4.backup.localHint') : t('p4.backup.webdavHint')}</p>
		</details>
	{/if}

	<h3>{t('p4.backup.crypt')}</h3>
	{#if msg(form, 'backupCrypt')?.error}<p class="err">{msg(form, 'backupCrypt')?.error}</p>{/if}
	{#if b.encrypted}
		<form method="POST" action="?/backupClearPassphrase" use:enhance={noReset} class="row item">
			<div class="grow">{t('p4.backup.cryptOn')}</div>
			<button class="danger" onclick={(e) => !confirm(t('p4.backup.cryptOffConfirm')) && e.preventDefault()}>{t('p4.backup.cryptOff')}</button>
		</form>
	{:else}
		<p class="hint">{t('p4.backup.cryptIntro')}</p>
		<form method="POST" action="?/backupPassphrase" use:enhance={noReset} class="row">
			<label>{t('p4.backup.passphrase')} <input name="passphrase" type="password" minlength="8" required autocomplete="new-password" /></label>
			<label>{t('p4.backup.passphrase2')} <input name="passphrase2" type="password" minlength="8" required autocomplete="new-password" /></label>
			<button class="primary">{t('p4.backup.cryptSave')}</button>
		</form>
	{/if}
	<p class="hint">{t('p4.backup.cryptHint')}</p>

	<h3>{t('p4.backup.restore')}</h3>
	{#if msg(form, 'backupRestore')?.error}<p class="err">{msg(form, 'backupRestore')?.error}</p>{/if}
	{#if form?.section === 'backupRestore' && form.restored}<p class="ok">✓ {t('p4.backup.restored', { file: form.before ?? '' })}</p>{/if}
	{#if b.pending}
		{@const p = b.pending}
		<div class="pending" data-testid="restore-pending">
			<p><strong>{t('p4.backup.pendingTitle')}</strong> <code>{p.source}</code></p>
			<dl>
				<dt>{t('p4.backup.createdAt')}</dt>
				<dd>{p.createdAt ? when(p.createdAt) : t('p4.backup.legacy')}</dd>
				{#if p.app}<dt>{t('p4.backup.appVersion')}</dt><dd>{p.app}</dd>{/if}
				<dt>{t('p4.backup.schemaLabel')}</dt>
				<dd>
					<code>{p.info.schema.tag ?? '?'}</code>
					{#if p.info.pending}<span class="muted"> · {t('p4.backup.migrations', { n: p.info.pending })}</span>{/if}
				</dd>
				<dt>{t('p4.backup.contents')}</dt>
				<dd>
					{t('p4.backup.counts', { members: p.info.counts.members ?? 0, events: p.info.counts.local_events ?? 0, chores: p.info.counts.chores ?? 0 })}{#if p.media}, {t('p4.backup.mediaCounts', { photos: p.media.photos, avatars: p.media.avatars })}{/if}
				</dd>
				{#if p.encrypted}<dt>{t('p4.backup.crypt')}</dt><dd>{t('p4.backup.wasEncrypted')}</dd>{/if}
			</dl>
			<p class="warn">{p.media ? t('p4.backup.replaceAll') : t('p4.backup.replaceDb')}</p>
			<div class="row">
				<form method="POST" action="?/backupConfirm" use:enhance={noReset}>
					<input type="hidden" name="id" value={p.id} />
					<button class="danger" onclick={confirmRestore} disabled={!!b.busy}>{t('p4.backup.restoreNow')}</button>
				</form>
				<form method="POST" action="?/backupCancel" use:enhance={noReset}><button>{t('common.cancel')}</button></form>
			</div>
		</div>
	{:else}
		<p class="hint">{t('p4.backup.restoreIntro')}</p>
		<form onsubmit={upload} class="row" data-testid="restore-upload">
			<label class="grow">{t('p4.backup.file')} <input name="file" type="file" accept=".gz,.enc,.db,application/gzip" required /></label>
			<label>{t('p4.backup.passphrase')} <input name="passphrase" type="password" autocomplete="off" placeholder={t('p4.backup.ifEncrypted')} /></label>
			<button class="primary" disabled={uploading !== null}>{uploading !== null ? t('p4.backup.uploading', { pct: uploading }) : t('p4.backup.check')}</button>
		</form>
		{#if uploadError}<p class="err">{uploadError}</p>{/if}
	{/if}
</section>

<style>
	.now {
		display: grid;
		gap: 8px;
		margin-bottom: 8px;
	}
	.last {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.target {
		border: 1px solid var(--line, rgba(127, 127, 127, 0.25));
		border-radius: 10px;
		padding: 12px 14px;
		margin: 0 0 12px;
		display: grid;
		gap: 8px;
	}
	.target header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.target .kind {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.7;
	}
	.target .st {
		margin-left: auto;
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}
	.short {
		width: 6em;
	}
	.small {
		margin: 0;
		font-size: 14px;
	}
	.files {
		width: 100%;
	}
	.files code {
		word-break: break-all;
	}
	.num {
		white-space: nowrap;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.actions-cell {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	.inline {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}
	details.list summary,
	details.add summary {
		cursor: pointer;
		padding: 4px 0;
	}
	details.add {
		margin-bottom: 8px;
	}
	.pending {
		border: 2px solid var(--bad, #c0392b);
		border-radius: 10px;
		padding: 12px 16px;
		display: grid;
		gap: 8px;
	}
	.pending p {
		margin: 0;
	}
	.pending dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		margin: 0;
	}
	.pending dt {
		opacity: 0.7;
	}
	.pending dd {
		margin: 0;
	}
	.warn {
		font-weight: 600;
	}
	@media (max-width: 700px) {
		.target .st {
			margin-left: 0;
		}
		.files td {
			display: block;
		}
		.actions-cell {
			justify-content: flex-start;
		}
	}
</style>
