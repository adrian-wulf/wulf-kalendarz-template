<script lang="ts">
	import { isPhotoAvatar } from '#lib/logic/profiles.js';

	/**
	 * Awatar domownika: zdjęcie w kółku albo emoji. Bez awatara – nic (albo kolorowa kropka z `dot`).
	 * Rozmiar w `em`, żeby rósł razem z tekstem obok (nazwa w kafelku, w wydarzeniu…).
	 */
	let { member, size = 1.2, dot = false, ring = false }: { member: { name: string; color: string; avatar: string | null }; size?: number; dot?: boolean; ring?: boolean } = $props();
</script>

{#if isPhotoAvatar(member.avatar)}
	<img class="av photo" class:ring src={member.avatar} alt="" style:--s="{size}em" style:--c={member.color} loading="lazy" decoding="async" />
{:else if member.avatar}
	<span class="av emoji" class:ring aria-hidden="true" style:--s="{size}em" style:--c={member.color}>{member.avatar}</span>
{:else if dot}
	<span class="av dot" aria-hidden="true" style:--s="{size * 0.6}em" style:--c={member.color}></span>
{/if}

<style>
	.av {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		vertical-align: -0.2em;
	}
	.photo {
		object-fit: cover;
		background: color-mix(in srgb, var(--c) 25%, var(--card));
	}
	.emoji {
		font-size: calc(var(--s) * 0.9);
		line-height: 1;
		width: auto;
		height: auto;
	}
	.ring.photo {
		box-shadow: 0 0 0 0.12em var(--c);
	}
	.dot {
		background: var(--c);
	}
</style>
