<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);

	onMount(() => {
		// Zwykła strona (przewijanie, zaznaczanie) i kolory jak w telefonie: jasne albo ciemne.
		const root = document.documentElement;
		root.classList.add('phone');
		const dark = matchMedia('(prefers-color-scheme: dark)');
		const apply = () => (root.dataset.phase = dark.matches ? 'night' : 'day');
		apply();
		dark.addEventListener('change', apply);
		return () => dark.removeEventListener('change', apply);
	});

	const submit = () => {
		busy = true;
		// Bez resetu formularza: reset czyści ukryte pole `next` (wartość ustawiona jako właściwość).
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>{t('sec.login.title')} · {t('common.appName')}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<div class="card" data-testid="login">
		<h1>{t('common.appName')}</h1>
		{#if data.needsSetup}
			<p class="lead">{t('sec.setup.lead')}</p>
			<form method="POST" action="?/setup" use:enhance={submit}>
				<label>
					<span>{t('sec.setup.code')}</span>
					<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="12" data-testid="setup-code" />
				</label>
				<p class="hint">{t('sec.setup.codeHint')}</p>
				<label>
					<span>{t('sec.newPassword')}</span>
					<input name="password" type="password" autocomplete="new-password" required minlength="10" data-testid="setup-password" />
				</label>
				<label>
					<span>{t('sec.repeatPassword')}</span>
					<input name="repeat" type="password" autocomplete="new-password" required minlength="10" data-testid="setup-repeat" />
				</label>
				{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
				<button class="primary" disabled={busy}>{t('sec.setup.submit')}</button>
			</form>
		{:else}
			<p class="lead">{t('sec.login.lead')}</p>
			<form method="POST" action="?/login" use:enhance={submit}>
				<input type="hidden" name="next" value={form && 'next' in form ? form.next : data.next} />
				<label>
					<span>{t('sec.password')}</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input name="password" type="password" autocomplete="current-password" required autofocus data-testid="password" />
				</label>
				{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
				<button class="primary" disabled={busy}>{t('sec.login.submit')}</button>
			</form>
		{/if}
	</div>
	<p class="foot">{t('sec.login.foot')}</p>
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 24px 16px;
	}
	.card {
		width: min(400px, 100%);
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 32px 28px 28px;
		box-shadow: var(--shadow);
	}
	h1 {
		margin: 0 0 6px;
		font: 600 30px/1.1 var(--font-head);
		letter-spacing: -0.01em;
	}
	.lead {
		margin: 0 0 22px;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.45;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
	}
	input {
		font: 400 17px var(--font-body);
		padding: 12px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--fg);
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.hint {
		margin: -6px 0 0;
		font-size: 13px;
		color: var(--muted);
		line-height: 1.4;
	}
	.err {
		margin: 0;
		color: var(--alert);
		font-size: 14px;
		font-weight: 600;
	}
	button.primary {
		margin-top: 6px;
		font: 600 17px var(--font-body);
		padding: 13px 18px;
		border-radius: 10px;
		border: none;
		background: var(--fg);
		color: var(--card);
		cursor: pointer;
	}
	button.primary:disabled {
		opacity: 0.6;
	}
	.foot {
		margin: 0;
		max-width: 400px;
		text-align: center;
		font-size: 13px;
		color: var(--muted);
		line-height: 1.4;
	}
</style>
