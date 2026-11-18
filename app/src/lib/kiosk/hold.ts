/**
 * Akcja „przytrzymaj, żeby potwierdzić” – ochrona przed przypadkowym dotykiem dziecka.
 * Ustawia na elemencie --hold (0–1) dla paska postępu; krótki tap woła onTap.
 */
export function hold(node: HTMLElement, opts: { ms?: number; onDone: () => void; onTap?: () => void }) {
	let o = opts;
	let start = 0;
	let raf = 0;
	let active = false;

	const set = (v: number) => node.style.setProperty('--hold', String(v));
	const stop = () => {
		active = false;
		cancelAnimationFrame(raf);
		node.classList.remove('holding');
		set(0);
	};
	const tick = () => {
		const p = Math.min(1, (performance.now() - start) / (o.ms ?? 1500));
		set(p);
		if (p >= 1) {
			stop();
			o.onDone();
		} else raf = requestAnimationFrame(tick);
	};
	const down = (e: PointerEvent) => {
		e.preventDefault();
		node.setPointerCapture?.(e.pointerId);
		active = true;
		start = performance.now();
		node.classList.add('holding');
		raf = requestAnimationFrame(tick);
	};
	const up = () => {
		if (!active) return;
		const short = performance.now() - start < 300;
		stop();
		if (short) o.onTap?.();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', stop);
	node.addEventListener('pointerleave', stop);
	return {
		update(n: typeof opts) {
			o = n;
		},
		destroy() {
			stop();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', stop);
			node.removeEventListener('pointerleave', stop);
		}
	};
}
