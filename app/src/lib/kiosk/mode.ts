/** Strona kiosku w okienku podglądu panelu (iframe) – nie ukrywamy kursora i nie wracamy sami do kalendarza. */
export const inPreview = () => typeof window !== 'undefined' && window.self !== window.top;

/** Ekran dotykowy kiosku: bez kursora myszy – ale nie w podglądzie panelu. */
export function kioskBody() {
	if (!inPreview()) document.body.classList.add('kiosk');
}
