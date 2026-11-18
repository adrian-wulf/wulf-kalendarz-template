<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep, msg, type ActionResult, type AdminMember } from '../admin.svelte.js';
	import type { AdminDataOf } from '#lib/modules/server-types.js';
	import type { members } from '#lib/server/admin-sections.js';
	import { t } from '#lib/i18n/index.js';
	import type { SubmitFunction } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import { isPhotoAvatar } from '#lib/logic/profiles.js';
	import { shrinkField } from '#lib/image.js';

	let { data, form }: { data: AdminDataOf<typeof members> & { members: AdminMember[]; today: string }; form: ActionResult } = $props();

	/** Urodziny bez roku ('--MM-DD') w polu daty z rokiem przestępnym 2000 – i zaznaczonym „rok nieznany”. */
	const dateValue = (b: string | null) => (b?.startsWith('--') ? `2000${b.slice(1)}` : (b ?? ''));
	const QUICK = ['👨', '👩', '👴', '👵', '🧑', '👦', '👧', '👶', '🐶', '🐱', '🦊', '🐻'];

	let photoError = $state<string | null>(null);
	/** Zdjęcie: kwadrat ze środka 256 px, zmniejszony w przeglądarce – na kiosku to małe kółko. */
	const photoUpload: SubmitFunction = async (input) => {
		photoError = null;
		if (!(await shrinkField(input.formData, 'photo', { max: 256, square: true, quality: 0.88 }))) {
			photoError = t('p3a.media.err.decode', { files: (input.formData.get('photo') as File | null)?.name ?? '' });
			return input.cancel();
		}
		return keep(input);
	};
</script>

<section id="domownicy" class="adm-sec">
	<h2>{t('admin.section.members')}</h2>
	{#if msg(form, 'members')?.error}<p class="err">{msg(form, 'members')?.error}</p>{/if}
	<div class="rows">
		{#each data.members as m, i (m.id)}
			<div class="card" style:--c={m.color} data-member={m.id}>
				<form method="POST" action="?/saveMember" use:enhance={keep} class="row member">
					<input type="hidden" name="id" value={m.id} />
					<span class="swatch"></span>
					<label>{t('setup.members.name')} <input name="name" value={m.name} required maxlength="30" /></label>
					<label>{t('setup.members.color')} <input type="color" name="color" value={m.color} list="palette" /></label>
					<label class="grow">{t('admin.members.calendars')} <input name="calendarIds" value={m.calendarIds.join(', ')} /></label>
					<label class="grow">{t('admin.members.emails')} <input name="emails" value={m.emails.join(', ')} /></label>
					<label>{t('p3a.members.birthday')} <input type="date" name="birthday" value={dateValue(m.birthday)} /></label>
					<label class="check noyear"><input type="checkbox" name="noYear" checked={!!m.birthday?.startsWith('--')} /> {t('p3a.members.noYear')}</label>
					<label>{t('p3a.members.nameDay')} <input name="nameDay" value={m.nameDay ?? ''} maxlength="30" size="10" placeholder={m.name} /></label>
					<button>{t('common.save')}</button>
					<button formaction="?/moveMember" name="dir" value="up" disabled={i === 0} title={t('admin.up')}>↑</button>
					<button formaction="?/moveMember" name="dir" value="down" disabled={i === data.members.length - 1} title={t('admin.down')}>↓</button>
					<button formaction="?/deleteMember" class="danger" onclick={(e) => !confirm(t('admin.confirmDelete', { name: m.name })) && e.preventDefault()}>{t('common.delete')}</button>
				</form>
				<div class="profile">
					<span class="pic"><Avatar member={m} size={2.4} dot /></span>
					<form method="POST" action="?/saveAvatar" use:enhance={keep} class="emoji">
						<input type="hidden" name="id" value={m.id} />
						<label>{t('p3a.members.emoji')} <input name="emoji" value={isPhotoAvatar(m.avatar) ? '' : (m.avatar ?? '')} maxlength="16" size="3" /></label>
						<button>{t('p3a.members.setEmoji')}</button>
						<span class="quick" role="group" aria-label={t('p3a.members.quick')}>
							{#each QUICK as q (q)}<button name="pick" value={q} class="q" aria-pressed={m.avatar === q}>{q}</button>{/each}
						</span>
					</form>
					<form method="POST" action="?/saveAvatar" enctype="multipart/form-data" use:enhance={photoUpload} class="photo">
						<input type="hidden" name="id" value={m.id} />
						<label class="button">
							📷 {t('p3a.members.photo')}
							<input type="file" name="photo" accept="image/*" class="visually-hidden" onchange={(e) => e.currentTarget.form?.requestSubmit()} />
						</label>
					</form>
					{#if m.avatar}
						<form method="POST" action="?/clearAvatar" use:enhance={keep}>
							<input type="hidden" name="id" value={m.id} />
							<button class="danger">{t('p3a.members.clearAvatar')}</button>
						</form>
					{/if}
				</div>
			</div>
		{/each}
		<form method="POST" action="?/saveMember" use:enhance class="row member new">
			<span class="swatch"></span>
			<label>{t('setup.members.name')} <input name="name" required maxlength="30" placeholder={t('admin.members.new')} /></label>
			<label>{t('setup.members.color')} <input type="color" name="color" value={data.palette[6]} list="palette" /></label>
			<label class="grow">{t('admin.members.calendars')} <input name="calendarIds" /></label>
			<label class="grow">{t('admin.members.emailsShort')} <input name="emails" /></label>
			<button class="primary">{t('setup.members.add')}</button>
		</form>
	</div>
	<datalist id="palette">{#each data.palette as c (c)}<option value={c}></option>{/each}</datalist>
	{#if photoError}<p class="err">{photoError}</p>{/if}
	<p class="hint">{t('p3a.members.profileHint')}</p>
	<p class="hint">
		{t('admin.members.binsReserved')}
		{#each data.bins as b (b.bin)}<span class="bin-swatch" style:--c={b.color} title={b.color}></span>{b.label}{' '}{/each}– {t('admin.members.binsRejected')}
	</p>
</section>

<style>
	.card {
		border: 1px solid var(--line);
		border-left: 6px solid var(--c);
		border-radius: 10px;
		background: var(--card);
		overflow: hidden;
	}
	.card > .row {
		border: 0;
		border-radius: 0;
	}
	.noyear {
		align-self: center;
		margin-top: 18px;
	}
	.profile {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 10px 14px 12px;
		border-top: 1px dashed var(--line);
		background: color-mix(in srgb, var(--c) 5%, var(--card));
	}
	.pic {
		display: inline-grid;
		place-items: center;
		width: 56px;
		height: 56px;
		font-size: 22px;
	}
	.profile form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 8px;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.q {
		font-size: 20px;
		line-height: 1;
		padding: 6px;
		background: transparent;
		border-color: transparent;
	}
	.q[aria-pressed='true'] {
		border-color: var(--fg);
	}
	.photo .button {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		color: var(--fg);
		font-size: 15px;
	}
	.photo .button:focus-within {
		outline: 2px solid var(--fg);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}
</style>
