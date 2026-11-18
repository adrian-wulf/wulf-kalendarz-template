<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { pinDone, pinPad } from '#lib/kiosk/pin.svelte.js';
	import { t, tn } from '#lib/i18n/index.js';

	/**
	 * Klawiatura PIN-u na kiosku: duże cyfry na dotyk, kropki zamiast cyfr, po pomyłkach przerwa
	 * (liczy serwer – `/api/kiosk/pin`). Zamyka się sama po bezczynności (60 s).
	 */
	const MAX = 8;
	let pin = $state('');
	let message = $state<string | null>(null);
	let shake = $state(0);
	let busy = $state(false);
	let lockedUntil = $state(0);
	let now = $state(Date.now());
	const timer = setInterval(() => (now = Date.now()), 250);
	let idle = setTimeout(() => pinDone(false), 60_000);
	onDestroy(() => {
		clearInterval(timer);
		clearTimeout(idle);
	});

	const wait = $derived(Math.max(0, Math.ceil((lockedUntil - now) / 1000)));
	const title = $derived(pinPad.reason === 'delete' ? t('sec.pad.delete') : pinPad.reason === 'approve' ? t('sec.pad.approve') : pinPad.reason === 'layers' ? t('cal.pad.layers') : t('sec.pad.settings'));

	function touch() {
		clearTimeout(idle);
		idle = setTimeout(() => pinDone(false), 60_000);
	}

	function press(d: string) {
		touch();
		if (busy || wait) return;
		message = null;
		if (pin.length < MAX) pin += d;
	}

	function back() {
		touch();
		pin = pin.slice(0, -1);
	}

	async function submit() {
		touch();
		if (busy || wait || pin.length < 4) return;
		busy = true;
		try {
			const r = await fetch('/api/kiosk/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
			const body = (await r.json().catch(() => ({}))) as { ok?: boolean; ttl?: number; retryMs?: number; left?: number };
			if (r.ok && body.ok) return pinDone(true, body.ttl ?? 0);
			pin = '';
			shake++;
			if (body.retryMs) lockedUntil = Date.now() + body.retryMs;
			message = body.left ? tn('sec.pad.left', body.left) : t('sec.pad.wrong');
		} catch {
			message = t('common.failed', { label: 'PIN' });
		} finally {
			busy = false;
		}
	}

	const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
</script>

<div class="pinpad-back" transition:fade={{ duration: 120 }} data-testid="pinpad">
	<div class="pad" role="dialog" aria-modal="true" aria-label={title} transition:scale={{ start: 0.96, duration: 160 }}>
		<h2>{title}</h2>
		{#key shake}
			<div class="dots" class:shake={shake > 0} aria-live="polite" aria-label={tn('sec.pad.digits', pin.length)}>
				{#each Array(Math.max(4, pin.length)) as _, i (i)}<span class:on={i < pin.length}></span>{/each}
			</div>
		{/key}
		<p class="msg" class:err={!!message || !!wait}>
			{#if wait}{t('sec.err.wait', { s: wait })}{:else if message}{message}{:else}{t('sec.pad.hint')}{/if}
		</p>
		<div class="keys">
			{#each KEYS as k (k)}
				<button type="button" class="key" disabled={!!wait} onclick={() => press(k)} data-key={k}>{k}</button>
			{/each}
			<button type="button" class="key aux" onclick={back} aria-label={t('sec.pad.back')} data-key="back">⌫</button>
			<button type="button" class="key" disabled={!!wait} onclick={() => press('0')} data-key="0">0</button>
			<button type="button" class="key ok" disabled={busy || !!wait || pin.length < 4} onclick={submit} data-key="ok">OK</button>
		</div>
		<button type="button" class="cancel" onclick={() => pinDone(false)}>{t('common.cancel')}</button>
	</div>
</div>

<style>
	.pinpad-back {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(20, 16, 12, 0.55);
		-webkit-user-select: none;
		user-select: none;
	}
	.pad {
		--k: min(13vmin, 128px);
		background: var(--bg);
		color: var(--fg);
		border-radius: calc(var(--k) * 0.28);
		padding: calc(var(--k) * 0.3) calc(var(--k) * 0.4) calc(var(--k) * 0.22);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--k) * 0.14);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
	}
	h2 {
		margin: 0;
		font: 700 calc(var(--k) * 0.3) var(--font-head);
		letter-spacing: -0.01em;
	}
	.dots {
		display: flex;
		gap: calc(var(--k) * 0.16);
		height: calc(var(--k) * 0.24);
		align-items: center;
	}
	.dots span {
		width: calc(var(--k) * 0.17);
		height: calc(var(--k) * 0.17);
		border-radius: 50%;
		border: 3px solid var(--fg);
	}
	.dots span.on {
		background: var(--fg);
	}
	.dots.shake {
		animation: shake 0.35s ease;
	}
	@keyframes shake {
		20%,
		60% {
			transform: translateX(-12px);
		}
		40%,
		80% {
			transform: translateX(12px);
		}
	}
	.msg {
		margin: 0;
		min-height: 1.3em;
		font: 500 calc(var(--k) * 0.16) var(--font-body);
		color: var(--muted);
	}
	.msg.err {
		color: var(--alert);
		font-weight: 700;
	}
	.keys {
		display: grid;
		grid-template-columns: repeat(3, var(--k));
		gap: calc(var(--k) * 0.14);
	}
	.key {
		width: var(--k);
		height: var(--k);
		border-radius: 50%;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
		font: 600 calc(var(--k) * 0.38) var(--font-body);
		font-variant-numeric: tabular-nums;
		touch-action: manipulation;
	}
	.key:active:not(:disabled) {
		background: var(--fg);
		color: var(--card);
	}
	.key:disabled {
		opacity: 0.4;
	}
	.key.aux {
		background: transparent;
		border-color: transparent;
		font-size: calc(var(--k) * 0.3);
	}
	.key.ok {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
		font-size: calc(var(--k) * 0.24);
		font-weight: 700;
	}
	.cancel {
		margin-top: calc(var(--k) * 0.06);
		font: 600 calc(var(--k) * 0.18) var(--font-body);
		padding: calc(var(--k) * 0.1) calc(var(--k) * 0.3);
		border-radius: 999px;
		border: none;
		background: transparent;
		color: var(--muted);
	}
</style>
