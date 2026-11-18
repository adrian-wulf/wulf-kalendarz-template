<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { setRegion } from '#lib/region.js';
	import { setLang, t } from '#lib/i18n/index.js';
	import type { LayoutProps } from './$types';
	// --- p4: security ---
	import PinPad from '#lib/components/kiosk/PinPad.svelte';
	import { configurePin, pinPad } from '#lib/kiosk/pin.svelte.js';

	let { children, data }: LayoutProps = $props();

	// Strefa czasowa i święta wg ustawień – przed renderem stron (SSR i przeglądarka).
	setRegion(untrack(() => data.region));
	$effect.pre(() => setRegion(data.region));

	// Język: ustawiany przed renderem; po zmianie (kreator, panel) cała strona renderuje się od nowa.
	const lang = $derived((setLang(data.language), data.language));
	const appTitle = $derived(lang && t('common.appName'));
	$effect(() => {
		document.documentElement.lang = lang;
	});

	// --- p4: security --- kiosk: kiedy pytać o PIN (dane z +layout.server, odświeżane z resztą).
	$effect.pre(() => configurePin(data.kioskPin));

	// Tylko sprawdzone kolory i kroje z listy – patrz themeCss().
	const style = $derived(`<style id="theme">${data.theme.css}</style>`);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{appTitle}</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html style}
</svelte:head>

{#key lang}
	{@render children()}
{/key}

{#if pinPad.open}<PinPad />{/if}
