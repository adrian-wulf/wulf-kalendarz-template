<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Sheet from './Sheet.svelte';
	import { lockPin } from '#lib/kiosk/pin.svelte.js';
	import { t, tn } from '#lib/i18n/index.js';

	/**
	 * Ustawienia kiosku (przytrzymanie zegara, za PIN-em): motyw, układ, jasność na teraz, wygaszacz,
	 * odświeżenie danych i adres telefonu/panelu z kodem QR. Reszta jest w panelu.
	 */
	let { onclose }: { onclose: () => void } = $props();

	type State = {
		theme: string;
		themes: { id: string; name: string; bg: string; card: string; fg: string }[];
		layout: string;
		layouts: { id: string; name: string }[];
		screensaver: { active: boolean };
		brightness: { steps: number[]; plan: number; now: number | null };
		links: { phone: string; admin: string; qrPhone: string; qrAdmin: string } | null;
		authMode: string;
		pin: boolean;
		setupCode: string | null;
	};

	let st = $state<State | null>(null);
	let failed = $state(false);
	let busy = $state<string | null>(null);
	let note = $state<string | null>(null);

	async function load() {
		try {
			const r = await fetch('/api/kiosk/settings');
			if (!r.ok) throw new Error();
			st = await r.json();
			failed = false;
		} catch {
			failed = true;
		}
	}
	onMount(load);

	async function act(action: string, value?: unknown) {
		busy = action;
		note = null;
		try {
			const r = await fetch('/api/kiosk/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, value }) });
			if (!r.ok) throw new Error();
			const res = (await r.json()) as { total?: number; failed?: number };
			if (action === 'sync') note = res.failed ? t('sec.kiosk.syncPartial', { failed: res.failed, total: res.total ?? 0 }) : tn('sec.kiosk.syncDone', res.total ?? 0);
			await Promise.all([load(), action === 'theme' || action === 'layout' || action === 'screensaver' ? invalidateAll() : null]);
		} catch {
			failed = true;
		} finally {
			busy = null;
		}
	}

	function close() {
		lockPin();
		onclose();
	}
</script>

<Sheet title={t('sec.kiosk.title')} onclose={close} closeLabel="✕ {t('common.close')}">
	<div class="grid" data-testid="kiosk-settings">
		{#if failed}<p class="error">{t('add.saveFailed')}</p>{/if}
		{#if !st}
			<p class="muted">…</p>
		{:else}
			<div class="col">
			<section>
				<h3>{t('sec.kiosk.theme')}</h3>
				<div class="chips">
					{#each st.themes as th (th.id)}
						<button type="button" class="chip" class:on={st.theme === th.id} aria-pressed={st.theme === th.id} disabled={!!busy} onclick={() => act('theme', th.id)} data-theme-id={th.id}>
							<span class="sw" style:background={th.bg} style:border-color={th.fg}><i style:background={th.card}></i></span>{th.name}
						</button>
					{/each}
				</div>
			</section>
			<section>
				<h3>{t('sec.kiosk.layout')}</h3>
				<div class="chips">
					{#each st.layouts as l (l.id)}
						<button type="button" class="chip" class:on={st.layout === l.id} aria-pressed={st.layout === l.id} disabled={!!busy} onclick={() => act('layout', l.id)}>{l.name}</button>
					{/each}
				</div>
			</section>
			<section>
				<h3>{t('sec.kiosk.brightness')}</h3>
				<div class="chips">
					{#each st.brightness.steps as b (b)}
						<button type="button" class="chip" class:on={st.brightness.now === b} aria-pressed={st.brightness.now === b} disabled={!!busy} onclick={() => act('brightness', b)}>{b}%</button>
					{/each}
					<button type="button" class="chip" class:on={st.brightness.now === null} aria-pressed={st.brightness.now === null} disabled={!!busy} onclick={() => act('brightness', null)}>
						{t('sec.kiosk.brightnessPlan', { level: st.brightness.plan })}
					</button>
				</div>
				<p class="hint">{t('sec.kiosk.brightnessHint')}</p>
			</section>
			<section class="row2">
				<div>
					<h3>{t('sec.kiosk.screensaver')}</h3>
					<div class="chips">
						<button type="button" class="chip" class:on={st.screensaver.active} aria-pressed={st.screensaver.active} disabled={!!busy} onclick={() => act('screensaver', true)}>{t('sec.on')}</button>
						<button type="button" class="chip" class:on={!st.screensaver.active} aria-pressed={!st.screensaver.active} disabled={!!busy} onclick={() => act('screensaver', false)}>{t('sec.off')}</button>
					</div>
				</div>
				<div>
					<h3>{t('sec.kiosk.data')}</h3>
					<div class="chips">
						<button type="button" class="chip" disabled={!!busy} onclick={() => act('sync')} data-testid="kiosk-sync">{busy === 'sync' ? '…' : t('sec.kiosk.sync')}</button>
						{#if note}<span class="muted" data-testid="kiosk-sync-note">{note}</span>{/if}
					</div>
				</div>
			</section>
			</div>
			<section class="links">
				<h3>{t('sec.kiosk.links')}</h3>
				{#if st.links}
					<div class="qrs">
						<figure>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="qr">{@html st.links.qrPhone}</div>
							<figcaption><b>{t('sec.kiosk.phone')}</b><span>{st.links.phone}</span></figcaption>
						</figure>
						<figure>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="qr">{@html st.links.qrAdmin}</div>
							<figcaption><b>{t('sec.kiosk.admin')}</b><span>{st.links.admin}</span></figcaption>
						</figure>
					</div>
				{:else}
					<p class="hint">{t('sec.kiosk.noOrigin')}</p>
				{/if}
				{#if st.setupCode}
					<p class="code" data-testid="setup-code-kiosk">{t('sec.kiosk.setupCode')} <b>{st.setupCode.slice(0, 4)} {st.setupCode.slice(4)}</b></p>
				{/if}
				{#if !st.pin}<p class="hint">{t('sec.kiosk.noPin')}</p>{/if}
			</section>
		{/if}
	</div>
</Sheet>

<style>
	.grid {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 26px 48px;
		align-content: start;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	.row2 > div {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 26px;
	}
	h3 {
		margin: 0;
		font: 700 30px var(--font-head);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		font: 600 26px var(--font-body);
		padding: 16px 26px;
		border-radius: 999px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--fg);
	}
	.chip.on {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	.chip:disabled:not(.on) {
		opacity: 0.6;
	}
	.sw {
		position: relative;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 2px solid;
		overflow: hidden;
	}
	.sw i {
		position: absolute;
		inset: 50% 0 0 0;
	}
	.qrs {
		display: flex;
		gap: 36px;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.qr {
		width: 260px;
		height: 260px;
		border-radius: 14px;
		overflow: hidden;
		background: #fff;
	}
	.qr :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	figcaption {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 22px;
		max-width: 260px;
	}
	figcaption span {
		color: var(--muted);
		font-size: 18px;
		word-break: break-all;
	}
	.hint,
	.muted {
		margin: 0;
		color: var(--muted);
		font-size: 22px;
		line-height: 1.35;
	}
	.code {
		margin: 0;
		font-size: 26px;
	}
	.code b {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.08em;
	}
	.error {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--alert);
		font: 700 24px var(--font-body);
	}
</style>
