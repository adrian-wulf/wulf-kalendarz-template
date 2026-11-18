/**
 * Szukanie zapomnianych polskich tekstów w komponentach (.svelte) – używa go test `i18n.test.ts`
 * (`npm run i18n:check` uruchamia same testy tłumaczeń). Pomija style, komentarze i dane z listy wyjątków.
 */

/** Polskie znaki albo typowe słowa interfejsu bez znaków diakrytycznych. */
const DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const WORDS =
	/\b(Zapisz|Dodaj|Dalej|Wstecz|Anuluj|Zamknij|Kalendarz|Zakupy|Kartki|Zadania|Zapasy|Ustawienia|Domownicy|Gotowe|Edytuj|Szukaj|Wybierz|Cofnij|Zdejmij|Kupione|Rodzina|Nazwa|Ikona|Kolor|Brak|Lista|wszystkie|Podgląd|Odśwież|Włącz|Wyłącz|Jutro|Dziś|Kiedy|Kto|Ile|zmień|gotowe|spacja)\b/;

/** Fragmenty, które wolno zostawić (dane, nazwy własne, przykłady w atrybutach testowych). */
export const ALLOWED = ['rodzina+bring@example.com', 'rodzina@example.com'];

/** Usuwa style, komentarze HTML i JS – zostaje kod i tekst do sprawdzenia. */
export function stripNoise(src: string): string {
	return src
		.replace(/<style[\s\S]*?<\/style>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Linie z podejrzanym polskim tekstem: [numer linii, treść]. */
export function findHardcoded(src: string): [number, string][] {
	const lines = stripNoise(src).split('\n');
	const out: [number, string][] = [];
	lines.forEach((raw, i) => {
		let line = raw;
		for (const a of ALLOWED) line = line.replaceAll(a, '');
		// klucze słownika i ich parametry nie są tekstem do tłumaczenia
		line = line.replace(/\bt\('[^']*'/g, "t(''");
		if (DIACRITICS.test(line) || WORDS.test(line.replace(/[a-z]+\.[a-zA-Z.]+/g, ''))) out.push([i + 1, raw.trim()]);
	});
	return out;
}
