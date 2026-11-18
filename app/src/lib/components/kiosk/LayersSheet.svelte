<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { needPin } from '#lib/kiosk/pin.svelte.js';
	import type { KioskLayers } from '#lib/calendars.js';
	import type { Member } from '#lib/types.js';
	import { t, tn } from '#lib/i18n/index.js';

	/**
	 * Kiosk → „Kalendarze”: dotknięcie kalendarza ukrywa go do północy (np. kalendarz pracy w weekend)
	 * i drugie dotknięcie przywraca. Na stałe – w panelu → Kalendarze. Bez PIN-u, chyba że panel blokuje.
	 */
	let { layers, members, onclose, onchanged }: { layers: KioskLayers; members: Member[]; onclose: () => void; onchanged: () => Promise<unknown> } = $props();

	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);
	/** Zmiany przed odświeżeniem danych (natychmiastowa reakcja na dotyk). */
	let local = $state<Record<string, boolean>>({});
	const isHidden = (id: string, fallback: boolean) => local[id] ?? fallback;
	const anyHidden = $derived(layers.list.some((l) => isHidden(l.id, l.hiddenToday)));
	const memberName = (id: string | null) => members.find((m) => m.id === id)?.name;

	async function send(body: Record<string, unknown>, key: string): Promise<boolean> {
		error = null;
		if (layers.locked && !(await needPin('layers'))) {
			error = t('cal.kiosk.locked');
			return false;
		}
		busy = key;
		try {
			const r = await fetch('/api/calendars', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (!r.ok) {
				error = r.status === 403 ? t('cal.kiosk.locked') : t('add.saveFailed');
				return false;
			}
			await onchanged();
			return true;
		} catch {
			error = t('add.saveFailed');
			return false;
		} finally {
			busy = null;
		}
	}

	async function toggle(id: string, hiddenNow: boolean) {
		local = { ...local, [id]: !hiddenNow };
		if (!(await send({ id, hidden: !hiddenNow }, id))) local = { ...local, [id]: hiddenNow };
	}

	async function showAll() {
		const before = local;
		local = Object.fromEntries(layers.list.map((l) => [l.id, false]));
		if (!(await send({ all: true }, 'all'))) local = before;
	}
</script>

<Sheet title={t('cal.kiosk.title')} {onclose} closeLabel="✕ {t('common.close')}">
	<div class="wrap" data-testid="layers-sheet">
		<p class="lead">{t('cal.kiosk.lead')}</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="grid">
			{#each layers.list as l (l.id)}
				{@const hidden = isHidden(l.id, l.hiddenToday)}
				<button
					type="button"
					class="layer"
					class:hidden
					role="switch"
					aria-checked={!hidden}
					disabled={busy !== null}
					style:--c={l.swatch ?? 'var(--accent)'}
					data-calendar={l.id}
					onclick={() => toggle(l.id, hidden)}
				>
					<span class="mark" class:dot={!l.icon}>{l.icon}</span>
					<span class="txt">
						<b>{l.name}</b>
						<small>{hidden ? t('cal.kiosk.hiddenToday') : memberName(l.memberId) ? `${t('cal.kiosk.visible')} · ${memberName(l.memberId)}` : t('cal.kiosk.visible')}</small>
					</span>
					<span class="sw" aria-hidden="true"><span></span></span>
				</button>
			{/each}
		</div>
		<footer>
			{#if anyHidden}<button type="button" class="all" disabled={busy !== null} onclick={showAll}>{t('cal.kiosk.showAll')}</button>{/if}
			<p class="hint">
				{t('cal.kiosk.hint')}
				{#if layers.hiddenInPanel}{tn('cal.kiosk.hiddenInPanel', layers.hiddenInPanel)}{/if}
			</p>
		</footer>
	</div>
</Sheet>

<style>
	.wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.lead {
		margin: 0;
		font-size: 26px;
		color: var(--muted);
	}
	.grid {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
		gap: 16px;
		align-content: start;
	}
	.layer {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 18px 22px;
		border-radius: 20px;
		border: 3px solid var(--line);
		border-left: 14px solid var(--c);
		background: var(--card);
		color: var(--fg);
		text-align: left;
		font: inherit;
	}
	.layer.hidden {
		background: var(--bg);
		border-left-color: var(--line);
	}
	.layer.hidden .mark,
	.layer.hidden b {
		opacity: 0.45;
	}
	.mark {
		flex: none;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 36px;
		background: color-mix(in srgb, var(--c) 20%, var(--card));
	}
	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	b {
		font: 700 30px/1.15 var(--font-body);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.mark.dot::after {
		content: '';
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--c);
	}
	small {
		font-size: 22px;
		color: var(--muted);
	}
	.layer.hidden small {
		color: var(--alert);
		font-weight: 600;
	}
	.sw {
		flex: none;
		position: relative;
		width: 88px;
		height: 48px;
		border-radius: 999px;
		background: #1f8a4c;
	}
	.sw span {
		position: absolute;
		top: 5px;
		left: 45px;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: #fff;
		transition: left 0.15s;
	}
	.layer.hidden .sw {
		background: var(--line);
	}
	.layer.hidden .sw span {
		left: 5px;
	}
	footer {
		display: flex;
		align-items: center;
		gap: 24px;
	}
	.all {
		flex: none;
		font: 700 26px var(--font-body);
		padding: 16px 28px;
		border-radius: 16px;
		border: none;
		background: var(--fg);
		color: var(--card);
	}
	.hint {
		margin: 0;
		font-size: 22px;
		color: var(--muted);
		line-height: 1.35;
	}
	.error {
		margin: 0;
		color: var(--alert);
		font: 700 24px var(--font-body);
	}
</style>
