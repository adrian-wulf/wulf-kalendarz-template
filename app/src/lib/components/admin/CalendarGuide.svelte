<script lang="ts">
	import { t, type TextKey } from '#lib/i18n/index.js';

	/**
	 * Instrukcje krok po kroku przy formularzach w panelu → Kalendarze (PL/DE/EN): skąd wziąć link iCal
	 * (Google, Outlook.com, iCloud, szkoła / klub), jak wyeksportować plik .ics i jak działa konto rodzinne
	 * w Google. Kroki w słowniku jako jeden tekst rozdzielony „|”.
	 */
	let { topic, open = false }: { topic: 'subscribe' | 'export' | 'google'; open?: boolean } = $props();

	type Tab = { id: string; label: TextKey; steps: TextKey; note?: TextKey };
	const TABS: Record<typeof topic, { title: TextKey; intro?: TextKey; tabs: Tab[] }> = {
		subscribe: {
			title: 'cal.guide.sub.title',
			intro: 'cal.guide.sub.intro',
			tabs: [
				{ id: 'google', label: 'cal.guide.tab.google', steps: 'cal.guide.sub.google', note: 'cal.guide.sub.googleNote' },
				{ id: 'outlook', label: 'cal.guide.tab.outlook', steps: 'cal.guide.sub.outlook' },
				{ id: 'icloud', label: 'cal.guide.tab.icloud', steps: 'cal.guide.sub.icloud' },
				{ id: 'club', label: 'cal.guide.tab.club', steps: 'cal.guide.sub.club' }
			]
		},
		export: {
			title: 'cal.guide.exp.title',
			intro: 'cal.guide.exp.intro',
			tabs: [
				{ id: 'google', label: 'cal.guide.tab.google', steps: 'cal.guide.exp.google' },
				{ id: 'outlook', label: 'cal.guide.tab.outlook', steps: 'cal.guide.exp.outlook' },
				{ id: 'icloud', label: 'cal.guide.tab.icloud', steps: 'cal.guide.exp.icloud' },
				{ id: 'mail', label: 'cal.guide.tab.mail', steps: 'cal.guide.exp.mail' }
			]
		},
		google: {
			title: 'cal.guide.fam.title',
			intro: 'cal.guide.fam.intro',
			tabs: [
				{ id: 'account', label: 'cal.guide.tab.account', steps: 'cal.guide.fam.account' },
				{ id: 'share', label: 'cal.guide.tab.share', steps: 'cal.guide.fam.share', note: 'cal.guide.fam.shareNote' },
				{ id: 'which', label: 'cal.guide.tab.which', steps: 'cal.guide.fam.which' }
			]
		}
	};
	const g = $derived(TABS[topic]);
	let tab = $state('');
	const current = $derived(g.tabs.find((x) => x.id === tab) ?? g.tabs[0]);
	const steps = $derived(t(current.steps).split('|').map((s) => s.trim()).filter(Boolean));
	const uid = $props.id();
</script>

<details class="guide" {open} data-guide={topic}>
	<summary>{t(g.title)}</summary>
	<div class="body">
		{#if g.intro}<p class="intro">{t(g.intro)}</p>{/if}
		<div class="tabs" role="tablist" aria-label={t(g.title)}>
			{#each g.tabs as x (x.id)}
				<button
					type="button"
					role="tab"
					id="{uid}-{x.id}"
					aria-selected={current.id === x.id}
					aria-controls="{uid}-panel"
					class:on={current.id === x.id}
					onclick={() => (tab = x.id)}>{t(x.label)}</button
				>
			{/each}
		</div>
		<div role="tabpanel" id="{uid}-panel" aria-labelledby="{uid}-{current.id}">
			<ol>
				{#each steps as s, i (i)}<li>{s}</li>{/each}
			</ol>
			{#if current.note}<p class="note">{t(current.note)}</p>{/if}
		</div>
	</div>
</details>

<style>
	.guide {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		flex: 1 1 100%;
	}
	summary {
		cursor: pointer;
		padding: 10px 14px;
		font-weight: 700;
		color: var(--fg);
	}
	.body {
		padding: 0 14px 14px;
		display: grid;
		gap: 10px;
	}
	.intro,
	.note {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
		line-height: 1.45;
	}
	.note {
		border-left: 3px solid var(--accent);
		padding-left: 10px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tabs button {
		font: 600 14px var(--font-body);
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--card);
		color: var(--fg);
		cursor: pointer;
	}
	.tabs button.on {
		background: var(--fg);
		color: var(--card);
		border-color: var(--fg);
	}
	ol {
		margin: 0;
		padding-left: 22px;
		display: grid;
		gap: 6px;
		font-size: 15px;
		line-height: 1.45;
		color: var(--fg);
	}
</style>
