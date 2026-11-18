/** Paleta do wyboru dla domowników – wyraźnie różna od kolorów pojemników z gotowych zestawów PL i DE. */
export const MEMBER_PALETTE = [
	'#0ea5e9',
	'#e0457b',
	'#8b5cf6',
	'#f2994a',
	'#c026d3',
	'#b45309',
	'#dc2626',
	'#0f766e',
	'#be185d'
] as const;

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorDistance(a: string, b: string): number {
	const [r, g, bl] = rgb(a);
	const [r2, g2, b2] = rgb(b);
	return Math.hypot(r - r2, g - g2, bl - b2);
}

/** Czy kolor jest zbyt podobny do któregoś z kolorów pojemników (z aktualnych reguł śmieci). */
export function clashesWithBins(hex: string, binColors: readonly string[], threshold = 60): boolean {
	return binColors.some((bin) => colorDistance(hex, bin) < threshold);
}
