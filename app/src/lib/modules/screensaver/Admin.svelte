<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { keep, msg, type ActionResult } from '#lib/components/admin/admin.svelte.js';
	import type { AdminDataOf } from '../server-types.js';
	import type hooks from './hooks.server.js';
	import { resizeImage } from '#lib/image.js';
	import { locale, t, tn } from '#lib/i18n/index.js';

	let { data, form }: { data: AdminDataOf<typeof hooks>; form: ActionResult } = $props();

	let busy = $state<{ done: number; all: number } | null>(null);
	let localError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();

	const mb = (n: number) => (n / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 });
	const total = $derived(data.photos.reduce((s, p) => s + p.size, 0));

	/** Zdjęcia zmniejszane w przeglądarce do 1920 px (ekran kiosku), po jednym – telefon nie zabraknie pamięci. */
	const upload: SubmitFunction = async ({ formData, cancel }) => {
		localError = null;
		const files = formData.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
		if (!files.length) return cancel();
		busy = { done: 0, all: files.length };
		formData.delete('photo');
		const failed: string[] = [];
		for (const f of files) {
			try {
				formData.append('photo', await resizeImage(f, { max: 1920, quality: 0.84 }), 'photo.jpg');
			} catch {
				failed.push(f.name);
			}
			busy = { done: busy.done + 1, all: files.length };
		}
		if (failed.length) localError = t('p3a.media.err.decode', { files: failed.join(', ') });
		if (!formData.getAll('photo').length) {
			busy = null;
			return cancel();
		}
		return async ({ update }) => {
			await update();
			busy = null;
			if (fileInput) fileInput.value = '';
		};
	};
</script>

<section id="wygaszacz" class="adm-sec">
	<h2>🖼 {t('module.screensaver')}</h2>
	<p class="muted">{t('p3a.saver.intro')}</p>
	{#if msg(form, 'screensaver')?.error}<p class="err">{msg(form, 'screensaver')?.error}</p>{/if}
	{#if localError}<p class="err">{localError}</p>{/if}

	<form method="POST" action="?/uploadPhotos" enctype="multipart/form-data" use:enhance={upload} class="row new upload">
		<label class="grow">
			{t('p3a.saver.add')}
			<input bind:this={fileInput} type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple required data-testid="photo-input" />
		</label>
		<button class="primary" disabled={!!busy}>{busy ? t('p3a.saver.uploading', { done: busy.done, all: busy.all }) : t('p3a.saver.upload')}</button>
	</form>
	<p class="hint">{t('p3a.saver.uploadHint')}</p>

	{#if data.photos.length}
		<p class="count">{tn('p3a.saver.count', data.photos.length)} · {mb(total)} MB</p>
		<ul class="photos">
			{#each data.photos as p (p.file)}
				<li>
					<img src={p.url} alt="" loading="lazy" decoding="async" />
					<form method="POST" action="?/deletePhoto" use:enhance={keep}>
						<input type="hidden" name="file" value={p.file} />
						<button class="danger" title={t('common.delete')} aria-label={t('common.delete')}>✕</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{t('p3a.saver.empty')}</p>
	{/if}
</section>

<style>
	.upload input[type='file'] {
		padding: 8px;
		border: 1px dashed var(--line);
		border-radius: 8px;
		background: var(--bg);
	}
	.count {
		margin: 18px 0 8px;
		font-weight: 700;
	}
	.photos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 10px;
	}
	.photos li {
		position: relative;
		aspect-ratio: 16 / 10;
		border-radius: 10px;
		overflow: hidden;
		background: var(--event-bg);
	}
	.photos img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.photos form {
		position: absolute;
		top: 6px;
		right: 6px;
	}
	.photos button {
		width: 34px;
		height: 34px;
		padding: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		border: none;
	}
	.empty {
		margin-top: 18px;
		padding: 28px;
		text-align: center;
		border: 1px dashed var(--line);
		border-radius: 10px;
		color: var(--muted);
	}
</style>
