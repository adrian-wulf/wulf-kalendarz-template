<script lang="ts">
	import type { Snippet } from 'svelte';
	import { canvasSize, overlayBox, type Size } from '#lib/layout.js';

	/**
	 * Płótno ekranu skalowane do okna (kiosk = 1:1, panel = podgląd).
	 * `base` – wymiary, pod które projektowano układ; `resolution` – ekran, do którego płótno
	 * dociąga proporcje ('auto' = okno przeglądarki). Bez `resolution` płótno to dokładnie `base`.
	 * `overlay` – okna (arkusze, komunikaty) na osobnej warstwie co najmniej 1440×1000.
	 */
	let {
		children,
		overlay,
		base = { w: 1920, h: 1080 },
		resolution
	}: { children: Snippet; overlay?: Snippet; base?: Size; resolution?: Size | 'auto' } = $props();

	let w = $state(0);
	let h = $state(0);
	// Przed pomiarem okna (SSR) – płótno projektu.
	const win = $derived(w && h ? { w, h } : base);
	const canvas = $derived(resolution ? canvasSize(base, resolution === 'auto' ? win : resolution) : base);
	const scale = $derived(Math.min(win.w / canvas.w, win.h / canvas.h));
	const box = $derived(overlayBox(canvas));
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<div class="viewport">
	<div class="stage" style:width="{canvas.w}px" style:height="{canvas.h}px" style:transform="scale({scale})" data-canvas="{canvas.w}x{canvas.h}">
		{@render children()}
		{#if overlay}
			<div class="overlay" style:width="{box.w}px" style:height="{box.h}px" style:transform={box.k === 1 ? undefined : `scale(${1 / box.k})`}>
				{@render overlay()}
			</div>
		{/if}
	</div>
</div>

<style>
	.viewport {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.stage {
		position: relative;
		flex: none;
		transform-origin: center;
		/* osobna warstwa – pomniejszony podgląd w panelu nie przerysowuje się przy ruchu myszy */
		will-change: transform;
	}
	.overlay {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
		pointer-events: none;
		/* nad przyciskami tygodnia (z-index 2) także bez skalowania */
		z-index: 20;
	}
	.overlay > :global(*) {
		pointer-events: auto;
	}
</style>
