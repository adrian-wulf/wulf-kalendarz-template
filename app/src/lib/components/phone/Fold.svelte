<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	/** Zwijana sekcja telefonu; stan (zwinięta/rozwinięta) zapamiętany na tym telefonie. */
	let { id, title, aside = '', open: initial = false, tone = '', children }: { id: string; title: string; aside?: string; open?: boolean; tone?: '' | 'warn'; children: Snippet } = $props();

	const key = () => `fold:${id}`;
	function stored(): boolean | null {
		try {
			const v = localStorage.getItem(key());
			return v === null ? null : v === '1';
		} catch {
			return null;
		}
	}
	let open = $state(false);
	// Po załadowaniu: zapamiętany stan albo domyślny.
	onMount(() => (open = stored() ?? initial));
	function toggle(e: Event) {
		open = (e.currentTarget as HTMLDetailsElement).open;
		try {
			localStorage.setItem(key(), open ? '1' : '0');
		} catch {
			/* bez pamięci – trudno */
		}
	}
</script>

<details class="fold {tone}" {open} ontoggle={toggle}>
	<summary>
		<span class="t">{title}</span>
		{#if aside}<span class="a">{aside}</span>{/if}
		<span class="chev" aria-hidden="true">›</span>
	</summary>
	<div class="in">{@render children()}</div>
</details>

<style>
	.fold {
		background: var(--card);
		border-radius: 14px;
		margin-bottom: 8px;
		box-shadow: var(--shadow);
	}
	.fold.warn {
		background: #fff1e6;
		color: #9a3412;
	}
	:global([data-phase='night']) .fold.warn {
		background: #4a2c1a;
		color: #ffd8b0;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 13px 14px;
		list-style: none;
		cursor: pointer;
		font-weight: 700;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.t {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.a {
		font-weight: 600;
		color: var(--muted);
		font-size: 15px;
		white-space: nowrap;
	}
	.fold.warn .a {
		color: inherit;
	}
	.chev {
		font-size: 22px;
		line-height: 1;
		color: var(--muted);
		transition: transform 0.15s;
	}
	details[open] .chev {
		transform: rotate(90deg);
	}
	.in {
		padding: 0 14px 12px;
	}
</style>
