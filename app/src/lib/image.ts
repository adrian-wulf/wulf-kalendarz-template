/**
 * Zmniejszanie zdjęć w przeglądarce przed wysłaniem do panelu: serwer nie potrzebuje natywnych
 * bibliotek (sharp/libvips) w obrazie Dockera, a telefon wysyła 0,2–0,8 MB zamiast 5–12 MB.
 * Obrót z EXIF uwzględnia `createImageBitmap(..., { imageOrientation: 'from-image' })`.
 */

export interface ResizeOptions {
	/** najdłuższy bok wyniku (px) */
	max: number;
	/** kwadrat wycięty ze środka (awatar) */
	square?: boolean;
	quality?: number;
}

export async function resizeImage(file: Blob, { max, square = false, quality = 0.85 }: ResizeOptions): Promise<Blob> {
	const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
	let sx = 0;
	let sy = 0;
	let sw = bmp.width;
	let sh = bmp.height;
	if (square) {
		const side = Math.min(sw, sh);
		sx = (sw - side) / 2;
		sy = (sh - side) / 2;
		sw = sh = side;
	}
	const scale = Math.min(1, max / Math.max(sw, sh));
	const w = Math.round(sw * scale);
	const h = Math.round(sh * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
	bmp.close();
	const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
	if (!blob) throw new Error('canvas');
	return blob;
}

/**
 * Dla `use:enhance`: podmienia plik z pola `field` na zmniejszony JPEG. Gdy przeglądarka nie umie
 * odczytać formatu (np. HEIC w Chrome), zwraca błąd do pokazania – formularz nie jest wysyłany.
 */
export async function shrinkField(formData: FormData, field: string, opts: ResizeOptions): Promise<boolean> {
	const file = formData.get(field);
	if (!(file instanceof File) || file.size === 0) return true;
	try {
		const blob = await resizeImage(file, opts);
		formData.set(field, blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
		return true;
	} catch {
		return false;
	}
}
