import { NAMEDAYS_PL } from './namedays-pl';
import { genitivePlForms } from './profiles';

/** Imieniny (PL) – tylko serwer: lista imion jest w paczce, ale nie trafia do przeglądarki kiosku. */

/** Imiona obchodzące imieniny danego dnia ('YYYY-MM-DD'), w dopełniaczu jak w kalendarzach. */
export const namedaysOn = (date: string): readonly string[] => NAMEDAYS_PL[date.slice(5)] ?? [];

const norm = (s: string) => s.trim().toLocaleLowerCase('pl');

/**
 * Czy osoba o imieniu `name` (mianownik, np. „Witold”, „Ania”) obchodzi imieniny wśród `names`
 * (dopełniacz, np. „Witolda”). Porównujemy wszystkie możliwe formy dopełniacza i sam mianownik.
 */
export function celebratesNameDay(name: string | null | undefined, names: readonly string[]): boolean {
	if (!name?.trim()) return false;
	const want = new Set([norm(name), ...genitivePlForms(name).map(norm)]);
	return names.some((n) => want.has(norm(n)));
}
