<script lang="ts">
	import { enhance } from '$app/forms';
	import { LANGUAGES } from '#lib/setup.js';
	import { getLang, t } from '#lib/i18n/index.js';

	/** Wybór języka zapisuje się od razu (`?/language`), a cały kreator przełącza się na nowy język. */
	let { payload = $bindable(), ready = $bindable() }: { payload: Record<string, unknown>; ready: boolean } = $props();

	const current = getLang();
	payload = { language: current };
	ready = true;
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/language"
	class="cards three"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	{#each LANGUAGES as l (l.code)}
		<button
			name="language"
			value={l.code}
			class="card choice"
			class:selected={l.code === current}
			disabled={busy}
			aria-pressed={l.code === current}
			data-testid="lang-{l.code}"
			lang={l.code}
		>
			<span class="code">{l.code.toUpperCase()}</span>
			<b>{l.name}</b>
		</button>
	{/each}
</form>
<p class="hint">{t('setup.lang.hint')}</p>

<style>
	.code {
		font: 600 var(--s-small) var(--font-body);
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	b {
		font: 600 var(--s-title) var(--font-head);
	}
</style>
