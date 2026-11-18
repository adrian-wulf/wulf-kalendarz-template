<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { fmtLongDate, fmtTime } from '#lib/format.js';
	import { inPreview } from '#lib/kiosk/mode.js';
	import { t } from '#lib/i18n/index.js';
	import type { ModuleData } from '#lib/modules/data.js';

	/**
	 * Wygaszacz: po `idleMinutes` bez dotyku pokaz zdjęć na cały ekran (powolne przybliżenie, przenikanie),
	 * mały zegar z datą. Dotknięcie wraca do kalendarza i nie klika niczego pod spodem.
	 * W nocy (ekran zgaszony przez agenta) i w podglądzie panelu nie startuje.
	 */
	let { config, night, onwake }: { config: ModuleData['screensaver']; night: boolean; onwake?: () => void } = $props();

	let active = $state(false);
	let index = $state(0);
	let now = $state(new Date());
	let lastTouch = Date.now();
	let shownAt = 0;
	/** proporcje zdjęć (szer./wys.) – dopasowanie: wypełnić ekran albo pokazać całe na rozmytym tle */
	let ratios = $state<Record<string, number>>({});

	const photos = $derived(config.photos);
	const current = $derived(photos.length ? photos[index % photos.length] : null);
	const next = $derived(photos.length > 1 ? photos[(index + 1) % photos.length] : null);
	const screenRatio = () => (typeof window === 'undefined' ? 16 / 9 : window.innerWidth / window.innerHeight);
	/** Zdjęcie o podobnych proporcjach wypełnia ekran; pionowe na poziomym (i odwrotnie) – całe, tło rozmyte. */
	const fits = (url: string) => {
		const r = ratios[url];
		return !r || Math.abs(Math.log(r / screenRatio())) < 0.35;
	};
	// Kierunek ruchu zmienia się co zdjęcie (deterministycznie – bez losowania przy każdym renderze).
	const MOVES = ['tl', 'br', 'tr', 'bl'] as const;

	function wake() {
		lastTouch = Date.now();
		if (!active) return;
		active = false;
		onwake?.();
	}

	onMount(() => {
		if (inPreview()) return;
		const touch = () => (lastTouch = Date.now());
		window.addEventListener('pointerdown', touch, true);
		window.addEventListener('keydown', touch, true);
		const tick = setInterval(() => {
			now = new Date();
			if (!active && photos.length && !night && Date.now() - lastTouch >= config.idleMinutes * 60_000) {
				active = true;
				index = Math.floor(Math.random() * photos.length);
				shownAt = Date.now();
			}
			if (active && Date.now() - shownAt >= config.slideSeconds * 1000) {
				index = (index + 1) % Math.max(photos.length, 1);
				shownAt = Date.now();
			}
		}, 1000);
		return () => {
			clearInterval(tick);
			window.removeEventListener('pointerdown', touch, true);
			window.removeEventListener('keydown', touch, true);
		};
	});

	// Noc albo brak zdjęć (usunięte w panelu) – wygaszacz znika.
	$effect(() => {
		if (active && (night || !photos.length)) active = false;
	});

	const loaded = (url: string) => (e: Event) => {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalHeight) ratios[url] = img.naturalWidth / img.naturalHeight;
	};
</script>

{#if active && current}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="saver"
		role="button"
		tabindex="-1"
		aria-label={t('p3a.saver.touchToReturn')}
		data-testid="screensaver"
		transition:fade={{ duration: 600 }}
		onpointerdown={(e) => e.preventDefault()}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			wake();
		}}
	>
		{#key current}
			<div class="slide" class:fit={!fits(current)} transition:fade={{ duration: 1500 }} style:--dur="{config.slideSeconds + 2}s">
				{#if !fits(current)}<img class="backdrop" src={current} alt="" aria-hidden="true" />{/if}
				<img class="photo move-{MOVES[index % MOVES.length]}" src={current} alt="" onload={loaded(current)} />
			</div>
		{/key}
		<!-- następne zdjęcie wczytuje się wcześniej, przejście bez mignięcia -->
		{#if next}<img class="preload" src={next} alt="" aria-hidden="true" onload={loaded(next)} />{/if}
		{#if config.clock}
			<div class="shade"></div>
			<div class="clock" aria-hidden="true">
				<span class="time">{fmtTime(now)}</span>
				<span class="date">{fmtLongDate(now)}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.saver {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: #000;
		overflow: hidden;
		cursor: none;
	}
	.slide {
		position: absolute;
		inset: 0;
	}
	.photo {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: kb var(--dur) linear both;
		will-change: transform;
	}
	.fit .photo {
		object-fit: contain;
	}
	.backdrop {
		position: absolute;
		inset: -6%;
		width: 112%;
		height: 112%;
		object-fit: cover;
		filter: blur(36px) brightness(0.55) saturate(1.1);
	}
	/* Powolne przybliżenie z lekkim przesunięciem (Ken Burns) – cztery kierunki na zmianę. */
	.move-tl {
		--x: -1.5%;
		--y: -1.2%;
	}
	.move-br {
		--x: 1.5%;
		--y: 1.2%;
	}
	.move-tr {
		--x: 1.5%;
		--y: -1.2%;
	}
	.move-bl {
		--x: -1.5%;
		--y: 1.2%;
	}
	@keyframes kb {
		from {
			transform: scale(1.02) translate(0, 0);
		}
		to {
			transform: scale(1.1) translate(var(--x), var(--y));
		}
	}
	.preload {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	/* Delikatne przyciemnienie w rogu – zegar czytelny także na jasnym zdjęciu. */
	.shade {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 60vmin;
		height: 36vmin;
		background: radial-gradient(ellipse at 0% 100%, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0) 70%);
		pointer-events: none;
	}
	.clock {
		position: absolute;
		left: 3.2vmin;
		bottom: 3vmin;
		display: flex;
		flex-direction: column;
		gap: 0.4vmin;
		color: #fff;
		text-shadow:
			0 1px 2px rgba(0, 0, 0, 0.55),
			0 0 24px rgba(0, 0, 0, 0.45);
		pointer-events: none;
	}
	.time {
		font-family: var(--font-head);
		font-size: 7.4vmin;
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.date {
		font-size: 2.6vmin;
		font-weight: 600;
		opacity: 0.92;
	}
	@media (prefers-reduced-motion: reduce) {
		.photo {
			animation: none;
		}
	}
</style>
