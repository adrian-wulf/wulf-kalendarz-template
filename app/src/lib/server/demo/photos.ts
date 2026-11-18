import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { mediaRoot } from '../media.js';

/**
 * Zdjęcia wygaszacza dla demo – rysowane w kodzie (bez zdjęć ludzi, bez cudzych plików):
 * proste krajobrazy z gradientów i sylwetek. Rysowane przy każdym resecie demo.
 *
 * Procedural landscape placeholders for the demo screensaver (no photos of people, no third-party images).
 */

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => {
	const k = Math.min(1, Math.max(0, t));
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
/** Gradient przez kilka kolorów (t: 0–1). */
const ramp = (stops: RGB[], t: number): RGB => {
	const k = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
	const i = Math.floor(k);
	return mix(stops[i], stops[i + 1], k - i);
};
const smooth = (e0: number, e1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

/** Grzbiet (0–1 wysokości ekranu) – suma sinusów, powtarzalna dla danego ziarna. */
function ridge(seed: number, base: number, amp: number, sharp = 1) {
	const waves = Array.from({ length: 5 }, (_, i) => ({ f: (1.3 + i * 1.9 + ((seed * (i + 3)) % 7) * 0.31) * Math.PI, p: seed * 1.7 + i * 2.3, a: amp / (i + 1) ** sharp }));
	return (x: number) => base - waves.reduce((s, w) => s + w.a * Math.sin(x * w.f + w.p), 0);
}

/** Pseudolosowe z dwóch liczb (gwiazdy, drzewa). */
const hash = (x: number, y: number) => {
	const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return n - Math.floor(n);
};

interface Layer {
	edge: (x: number) => number;
	color: (x: number, y: number) => RGB;
}

/** Scena: niebo + warstwy (od najdalszej), opcjonalnie odbicie w wodzie poniżej `water`. */
function scene(sky: (x: number, y: number) => RGB, layers: Layer[], water?: { level: number; tint: RGB }) {
	return (x: number, y: number): RGB => {
		if (water && y > water.level) {
			// Odbicie: ta sama scena odwrócona, przyciemniona, z poziomymi zmarszczkami.
			const ry = water.level - (y - water.level) * 1.1;
			const ripple = Math.sin(y * 700) * 0.0005;
			const c = paint(x + ripple, ry);
			return mix(c, water.tint, 0.3 + (y - water.level) * 1.2);
		}
		return paint(x, y);
	};
	function paint(x: number, y: number): RGB {
		let c = sky(x, y);
		for (const l of layers) if (y >= l.edge(x)) c = l.color(x, y);
		return c;
	}
}

const SCENES: { name: string; draw: (x: number, y: number) => RGB }[] = [
	{
		// Góry o świcie: niebo granat → brzoskwinia, słońce, trzy pasma coraz bliżej i ciemniej.
		name: 'demo-1-gory-o-swicie',
		draw: (() => {
			const skyStops = ['#1e2a4a', '#4b4f7c', '#b07a8c', '#f2b48a', '#fbe0b5'].map(hex);
			const sun = { x: 0.68, y: 0.5, r: 0.045 };
			return scene(
				(x, y) => {
					const d = Math.hypot((x - sun.x) * 1.78, y - sun.y);
					const base = ramp(skyStops, y / 0.62);
					const glow = mix(base, hex('#fff1d6'), Math.exp(-d * 7) * 0.8);
					return d < sun.r ? hex('#fff6e4') : glow;
				},
				[
					{ edge: ridge(3, 0.5, 0.06, 1.2), color: (_x, y) => mix(hex('#8e7f9f'), hex('#a593ae'), (y - 0.4) * 2) },
					{ edge: ridge(7, 0.6, 0.07, 1.1), color: (_x, y) => mix(hex('#5a5279'), hex('#6e638a'), (y - 0.5) * 2) },
					{ edge: ridge(11, 0.72, 0.08, 1), color: (_x, y) => mix(hex('#2e2b48'), hex('#3a3654'), (y - 0.6) * 2) },
					{ edge: ridge(17, 0.86, 0.05, 0.8), color: () => hex('#1b1a2c') }
				]
			);
		})()
	},
	{
		// Zachód słońca nad morzem: słońce na horyzoncie, smuga światła na wodzie.
		name: 'demo-2-morze',
		draw: (() => {
			const skyStops = ['#2b2350', '#6e3a6c', '#d0645e', '#f3a35e', '#fbd38a'].map(hex);
			const horizon = 0.62;
			const sunX = 0.42;
			return (x: number, y: number): RGB => {
				const dx = Math.abs(x - sunX) * 1.78;
				if (y <= horizon) {
					const d = Math.hypot(dx, y - horizon);
					const c = ramp(skyStops, y / horizon);
					const cloud = smooth(0.78, 1, Math.sin(y * 26 + Math.sin(x * 3.1 + 1) * 1.1) * 0.5 + 0.5) * smooth(0.15, 0.35, y) * (1 - smooth(0.42, 0.55, y)) * 0.22;
					const lit = mix(c, hex('#ffd2a0'), cloud);
					return d < 0.07 ? hex('#ffe7b5') : mix(lit, hex('#ffd59a'), Math.exp(-d * 6) * 0.7);
				}
				const depth = (y - horizon) / (1 - horizon);
				const sea = mix(hex('#b9706b'), hex('#1f1c40'), depth ** 0.55);
				const width = 0.04 + depth * 0.16;
				const streak = smooth(0.35, 1, Math.sin(y * (700 + depth * 400) + Math.sin(x * 50) * 0.8) * 0.5 + 0.5);
				const path = Math.exp(-((dx / width) ** 2)) * streak * (1 - depth * 0.6);
				return mix(sea, hex('#ffd9a0'), path * 0.85);
			};
		})()
	},
	{
		// Noc nad wzgórzami: gwiazdy, księżyc, łagodne pagórki.
		name: 'demo-3-noc',
		draw: (() => {
			const moon = { x: 0.24, y: 0.22, r: 0.035 };
			return scene(
				(x, y) => {
					const c = mix(hex('#0b1026'), hex('#25345e'), y / 0.75);
					const d = Math.hypot((x - moon.x) * 1.78, y - moon.y);
					if (d < moon.r) return hex('#f3efe0');
					const halo = mix(c, hex('#5a6aa0'), Math.exp(-d * 9) * 0.6);
					const sx = Math.floor(x * 1600);
					const sy = Math.floor(y * 900);
					const star = hash(sx, sy) > 0.9985 && y < 0.65 ? 0.6 + hash(sy, sx) * 0.4 : 0;
					return mix(halo, hex('#ffffff'), star);
				},
				[
					{ edge: ridge(5, 0.66, 0.05, 1.6), color: () => hex('#1c2a4a') },
					{ edge: ridge(9, 0.76, 0.05, 1.5), color: () => hex('#14203a') },
					{ edge: ridge(13, 0.88, 0.04, 1.4), color: () => hex('#0c1428') }
				]
			);
		})()
	},
	{
		// Wydmy w południe: jasne niebo, piasek – strona do słońca jaśniejsza, płynne przejście.
		name: 'demo-4-wydmy',
		draw: (() => {
			const dunes = [ridge(21, 0.58, 0.05, 2), ridge(23, 0.7, 0.06, 2), ridge(29, 0.84, 0.06, 2)];
			const shades: [RGB, RGB][] = [
				[hex('#f0cf9c'), hex('#c99a63')],
				[hex('#e9bd84'), hex('#b9844f')],
				[hex('#e0ad70'), hex('#a8703d')]
			];
			return scene(
				(_x, y) => ramp(['#6fa8d6', '#9cc7e6', '#d8e9f2', '#f4efe2'].map(hex), y / 0.6),
				dunes.map((edge, i) => ({
					edge,
					color: (x, y) => {
						const slope = (edge(x + 0.004) - edge(x - 0.004)) / 0.008;
						const lit = mix(shades[i][1], shades[i][0], smooth(-1.4, 1.4, slope));
						return mix(lit, shades[i][1], smooth(0, 0.25, y - edge(x)) * 0.5);
					}
				}))
			);
		})()
	},
	{
		// Jezioro w lesie: mgła, sylwetki świerków, odbicie.
		name: 'demo-5-jezioro',
		draw: (() => {
			// Świerki: losowa szerokość, wysokość i przesunięcie w każdej „komórce”.
			const trees = (seed: number, cells: number, base: number, height: number) => (x: number) => {
				const cell = Math.floor(x * cells);
				const local = x * cells - cell;
				const w = 0.25 + hash(cell, seed) * 0.25;
				const c = 0.5 + (hash(seed, cell) - 0.5) * 0.3;
				const h = height * (0.55 + hash(cell + 7, seed) * 0.6);
				const k = Math.max(0, 1 - Math.abs(local - c) / w);
				return base - h * k - Math.sin(x * 7 + seed) * 0.012;
			};
			return scene(
				(_x, y) => ramp(['#9fb7b9', '#c9d6cf', '#e8ebdf'].map(hex), y / 0.55),
				[
					{ edge: ridge(31, 0.47, 0.03, 1.5), color: () => hex('#8fa7a3') },
					{ edge: trees(3, 46, 0.535, 0.07), color: (_x, y) => mix(hex('#6d8a82'), hex('#86a098'), smooth(0.48, 0.55, y) * 0.6) },
					{ edge: trees(11, 28, 0.56, 0.11), color: () => hex('#2f4a44') }
				],
				{ level: 0.56, tint: hex('#4e6b68') }
			);
		})()
	}
];

/** PNG RGB bez zależności (filtr „Up” – gradienty z góry na dół kompresują się dobrze). */
export function encodePng(w: number, h: number, pixel: (x: number, y: number) => RGB): Buffer {
	const stride = w * 3 + 1;
	const raw = Buffer.alloc(stride * h);
	const prev = new Uint8Array(w * 3);
	const row = new Uint8Array(w * 3);
	for (let y = 0; y < h; y++) {
		raw[y * stride] = 2;
		for (let x = 0; x < w; x++) {
			const c = pixel(x / w, y / h);
			for (let k = 0; k < 3; k++) row[x * 3 + k] = Math.max(0, Math.min(255, Math.round(c[k])));
		}
		for (let i = 0; i < w * 3; i++) raw[y * stride + 1 + i] = (row[i] - prev[i]) & 255;
		prev.set(row);
	}
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(td));
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

let cache: { w: number; files: Buffer[] } | null = null;

export const DEMO_PHOTO_NAMES = SCENES.map((s) => `${s.name}.png`);

/** Rysuje zdjęcia wygaszacza do `media/photos` (stare pliki – także wgrane przez gości demo – znikają). */
export function writeDemoPhotos(w = 1600, h = 900) {
	const dir = join(mediaRoot(), 'photos');
	rmSync(dir, { recursive: true, force: true });
	rmSync(join(mediaRoot(), 'avatars'), { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	// Rysowanie trwa kilka sekund – przy kolejnych resetach te same pliki z pamięci.
	if (cache?.w !== w) cache = { w, files: SCENES.map((s) => encodePng(w, h, s.draw)) };
	SCENES.forEach((s, i) => writeFileSync(join(dir, `${s.name}.png`), cache!.files[i]));
}
