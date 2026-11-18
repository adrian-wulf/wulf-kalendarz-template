<script lang="ts">
	import type { Component } from 'svelte';
	import { getModule } from '#lib/modules/index.js';
	import ModuleSettings from '#lib/components/admin/ModuleSettings.svelte';
	import DemoLock from '#lib/components/admin/DemoLock.svelte';
	import GoogleSection from '#lib/components/admin/sections/GoogleSection.svelte';
	import MembersSection from '#lib/components/admin/sections/MembersSection.svelte';
	import EventsSection from '#lib/components/admin/sections/EventsSection.svelte';
	import RegionSection from '#lib/components/admin/sections/RegionSection.svelte';
	import SettingsSection from '#lib/components/admin/sections/SettingsSection.svelte';
	import LayoutSection from '#lib/components/admin/sections/LayoutSection.svelte';
	import ThemeSection from '#lib/components/admin/ThemeSection.svelte';
	import ShoppingAdmin from '#lib/modules/shopping/Admin.svelte';
	import NotesAdmin from '#lib/modules/notes/Admin.svelte';
	import ChoresAdmin from '#lib/modules/chores/Admin.svelte';
	import WasteAdmin from '#lib/modules/waste/Admin.svelte';
	import SnakesAdmin from '#lib/modules/snakes/Admin.svelte';
	import PantryAdmin from '#lib/modules/pantry/Admin.svelte';
	import ScreenSection from '#lib/components/admin/sections/ScreenSection.svelte';
	import ScreensaverAdmin from '#lib/modules/screensaver/Admin.svelte';
	// --- p3b: meals, kids, countdown ---
	import MealsAdmin from '#lib/modules/meals/Admin.svelte';
	import KidsAdmin from '#lib/modules/kids/Admin.svelte';
	import CountdownAdmin from '#lib/modules/countdown/Admin.svelte';
	// --- p3c: care, transit, home assistant ---
	import MedsAdmin from '#lib/modules/meds/Admin.svelte';
	import CareAdmin from '#lib/modules/care/Admin.svelte';
	import TransitAdmin from '#lib/modules/transit/Admin.svelte';
	import HomeAssistantAdmin from '#lib/modules/homeassistant/Admin.svelte';
	// --- p4: backups ---
	import BackupSection from '#lib/components/admin/sections/BackupSection.svelte';
	// --- p4: security ---
	import SecuritySection from '#lib/components/admin/sections/SecuritySection.svelte';
	// --- 26a: calendar layers ---
	import CalendarsSection from '#lib/components/admin/sections/CalendarsSection.svelte';
	// --- 26b: guides ---
	import Guide from '#lib/components/admin/Guide.svelte';
	import { page } from '$app/state';
	import type { TipState } from '#lib/guides/index.js';
	import type { ThemeSettings } from '#lib/theme.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * Widok każdej sekcji (slug → komponent). Dane i akcje są w `admin-sections.ts` (rdzeń)
	 * i w `lib/modules/<id>/hooks.server.ts` (moduły). Moduł bez widoku ma tylko formularz ustawień.
	 */
	const VIEWS: Record<string, Component<{ data: never; form: never }>> = {
		google: GoogleSection,
		domownicy: MembersSection,
		wydarzenia: EventsSection,
		region: RegionSection,
		uklad: LayoutSection,
		ustawienia: SettingsSection,
		zakupy: ShoppingAdmin,
		kartki: NotesAdmin,
		zadania: ChoresAdmin,
		smieci: WasteAdmin,
		weze: SnakesAdmin,
		zapasy: PantryAdmin,
		ekran: ScreenSection,
		// --- p4: security ---
		dostep: SecuritySection,
		wygaszacz: ScreensaverAdmin,
		// --- p3b: meals, kids, countdown ---
		posilki: MealsAdmin,
		dzieci: KidsAdmin,
		odliczanie: CountdownAdmin,
		// --- p3c: care, transit, home assistant ---
		leki: MedsAdmin,
		opieka: CareAdmin,
		odjazdy: TransitAdmin,
		'home-assistant': HomeAssistantAdmin,
		// --- p4: backups ---
		kopie: BackupSection,
		// --- 26a: calendar layers ---
		kalendarze: CalendarsSection
	};

	const View = $derived(VIEWS[data.section]);
	// Demo: integracje, kopie i dostęp tylko do podglądu (zakupy – tylko część Bring!, w samym komponencie).
	const LOCKED_IN_DEMO = ['google', 'home-assistant', 'kopie', 'dostep'];
	const schema = $derived(data.module ? getModule(data.module.id)?.settings : undefined);

	// --- 26b: guides --- błąd połączenia z ostatniego wczytania strony = „zaczęte, ale nie działa”
	const d = $derived(data as unknown as { ha?: { error: string | null }; google?: { calendarsError: string | null }; transit?: { tile?: { error?: string | null } } });
	const live = (id: string, st: TipState | null): TipState | null =>
		st === 'done' && ((id === 'ha' && d.ha?.error) || (id === 'google' && d.google?.calendarsError) || (id === 'transit' && d.transit?.tile?.error)) ? 'started' : st;
</script>

{#if data.guides.length}
	<div class="guides">
		{#each data.guides as g, i (g.id)}
			{@const st = live(g.id, g.state)}
			<!-- Link z listy (?guide=) otwiera tylko swój przewodnik; inaczej pierwszy, gdy nic jeszcze nie działa. -->
			<Guide id={g.id} status={st} ctx={data.guide.ctx} params={data.guide.params} open={page.url.searchParams.has('guide') ? page.url.searchParams.get('guide') === g.id : i === 0 && st === 'todo'} />
		{/each}
	</div>
{/if}

{#if data.section === 'wyglad'}
	<ThemeSection theme={(data as unknown as { theme: ThemeSettings }).theme} status={(form as { section?: string } | null)?.section === 'theme' ? (form as { ok?: boolean; error?: string }) : null} />
{:else if View && LOCKED_IN_DEMO.includes(data.section)}
	<DemoLock pin={data.section === 'dostep'}><View data={data as never} form={form as never} /></DemoLock>
{:else if View}
	<View data={data as never} form={form as never} />
{:else if data.module}
	<section class="adm-sec">
		<h2>{data.module.icon} {data.module.name}</h2>
		<p class="muted">{data.module.description}</p>
	</section>
{/if}

{#if schema && data.config}
	<ModuleSettings {schema} values={data.config} form={form as never} />
{/if}

<style>
	/* --- 26b: guides --- przewodnik tuż nad sekcją, której dotyczy */
	.guides {
		display: grid;
		gap: 12px;
		margin-bottom: -16px;
	}
</style>
