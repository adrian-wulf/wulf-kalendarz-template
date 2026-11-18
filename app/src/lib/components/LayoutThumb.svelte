<script lang="ts">
	import { presetOf, type LayoutPresetId } from '#lib/layout.js';

	/** Miniatura układu ekranu (panel i kreator): prostokąty w %, bez prawdziwych danych. */
	let { preset, height = 120 }: { preset: LayoutPresetId; height?: number } = $props();

	type Box = [number, number, number, number, 'today' | 'week' | 'rows' | 'month' | 'tile' | 'strip'];
	const tiles = (y: number, h: number): Box[] => [
		[3, y, 30, h, 'tile'],
		[35, y, 30, h, 'tile'],
		[67, y, 30, h, 'tile']
	];
	const THUMBS: Record<LayoutPresetId, Box[]> = {
		'today-week': [[3, 4, 28, 64, 'today'], [33, 4, 64, 64, 'week'], ...tiles(71, 25)],
		week: [[3, 4, 94, 16, 'strip'], [3, 23, 94, 49, 'week'], ...tiles(75, 21)],
		month: [[3, 4, 25, 68, 'today'], [30, 4, 67, 68, 'month'], ...tiles(75, 21)],
		portrait: [[4, 2, 92, 22, 'today'], [4, 26, 92, 52, 'rows'], ...tiles(80, 18).map(([x, y, w, h, k]): Box => [x + 1, y, w - 1, h, k])],
		small: [[3, 4, 30, 63, 'today'], [35, 4, 62, 63, 'week'], ...tiles(70, 26)]
	};
	const base = $derived(presetOf(preset)!.base);
</script>

<span class="thumb" style:aspect-ratio="{base.w} / {base.h}" style:--h="{height}px" class:tall={base.h > base.w} class:four={preset === 'small'} aria-hidden="true">
	{#each THUMBS[preset] as [x, y, w, h, k], i (i)}
		<span class="box {k}" style:left="{x}%" style:top="{y}%" style:width="{w}%" style:height="{h}%"></span>
	{/each}
</span>

<style>
	.thumb {
		position: relative;
		display: block;
		justify-self: center;
		align-self: center;
		width: 100%;
		max-height: var(--h);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.thumb.tall {
		width: auto;
		height: var(--h);
	}
	.box {
		position: absolute;
		border-radius: 3px;
		background: var(--card);
		box-shadow: 0 0 0 1px var(--line);
	}
	.box.today,
	.box.strip {
		background: color-mix(in srgb, var(--accent) 22%, var(--card));
	}
	.box.week {
		background: repeating-linear-gradient(90deg, var(--card) 0 calc(100% / 7 - 1px), var(--line) calc(100% / 7 - 1px) calc(100% / 7));
	}
	.four .box.week {
		background: repeating-linear-gradient(90deg, var(--card) 0 calc(25% - 1px), var(--line) calc(25% - 1px) 25%);
	}
	.box.rows {
		background: repeating-linear-gradient(180deg, var(--card) 0 calc(100% / 7 - 1px), var(--line) calc(100% / 7 - 1px) calc(100% / 7));
	}
	.box.month {
		background:
			repeating-linear-gradient(90deg, transparent 0 calc(100% / 7 - 1px), var(--line) calc(100% / 7 - 1px) calc(100% / 7)),
			repeating-linear-gradient(180deg, var(--card) 0 calc(20% - 1px), var(--line) calc(20% - 1px) 20%);
	}
</style>
