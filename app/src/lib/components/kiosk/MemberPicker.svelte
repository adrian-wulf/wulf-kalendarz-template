<script lang="ts">
	import type { Member } from '#lib/types.js';
	import Avatar from '../Avatar.svelte';
	import { isPhotoAvatar } from '#lib/logic/profiles.js';
	import { t } from '#lib/i18n/index.js';

	/** Duże kafle domowników; null = cała rodzina / ktokolwiek. */
	let { members, onpick, allLabel = `👨‍👩‍👧‍👦 ${t('add.wholeFamilyTile')}` }: { members: Member[]; onpick: (id: string | null) => void; allLabel?: string } =
		$props();
</script>

<div class="grid">
	{#each members as m (m.id)}
		<button type="button" class="tile" style:--c={m.color} onclick={() => onpick(m.id)}>
			{#if m.avatar}<span class="face" class:photo={isPhotoAvatar(m.avatar)}><Avatar member={m} size={1.5} /></span>{:else}<span class="dot"></span>{/if}{m.name}
		</button>
	{/each}
	<button type="button" class="tile all" onclick={() => onpick(null)}>{allLabel}</button>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 22px;
	}
	.tile {
		height: 170px;
		border-radius: 22px;
		border: none;
		background: var(--c);
		color: #fff;
		font: 800 44px var(--font-body);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		box-shadow: 0 6px 0 color-mix(in srgb, var(--c) 60%, #000);
	}
	.tile:active {
		transform: translateY(4px);
		box-shadow: none;
	}
	.dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.85);
	}
	.face {
		display: inline-grid;
		place-items: center;
		line-height: 1;
	}
	.face.photo {
		border: 4px solid rgba(255, 255, 255, 0.85);
		border-radius: 50%;
	}
	.all {
		--c: var(--card);
		color: var(--fg);
		border: 3px solid var(--line);
		box-shadow: 0 6px 0 var(--line);
		font-size: 34px;
	}
</style>
