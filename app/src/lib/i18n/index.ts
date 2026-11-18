/**
 * Tłumaczenia interfejsu: polski (źródło), niemiecki i angielski. Słowniki są zwykłymi obiektami
 * w paczce (bez pobierania w czasie działania). Bieżący język ustawia `hooks.server.ts` na każde
 * żądanie i główny layout w przeglądarce – tak jak region. Jedno gospodarstwo = jeden język.
 *
 * UI translations: Polish is the source of truth, German and English must have the same keys
 * (TypeScript reports a missing key). `t(key, params)` works on the server and in the browser.
 */
import pl from './pl.js';
import de from './de.js';
import en from './en.js';

export type Lang = 'pl' | 'de' | 'en';

export const LANGS = ['pl', 'de', 'en'] as const satisfies readonly Lang[];

/** Nazwy języków – zawsze we własnym języku (wybór w kreatorze i panelu). */
export const LANG_NAMES: Record<Lang, string> = { pl: 'Polski', de: 'Deutsch', en: 'English' };

/** Locale do `Intl` (daty, liczby, sortowanie). Tydzień zawsze od poniedziałku. */
export const LOCALES: Record<Lang, string> = { pl: 'pl-PL', de: 'de-DE', en: 'en-GB' };

export const isLang = (v: unknown): v is Lang => v === 'pl' || v === 'de' || v === 'en';

/** Formy liczby mnogiej wg `Intl.PluralRules` (PL: one / few / many, DE i EN: one / other). */
export interface Plural {
	one?: string;
	few?: string;
	many?: string;
	other: string;
}

type Source = typeof pl;
export type Key = keyof Source;
/** Klucze ze zwykłym tekstem (`t`) i z formami liczby mnogiej (`tn`). */
export type TextKey = { [K in Key]: Source[K] extends string ? K : never }[Key];
export type PluralKey = Exclude<Key, TextKey>;
/** Kształt słownika – niemiecki i angielski muszą mieć dokładnie te klucze. */
export type Dict = { [K in Key]: Source[K] extends string ? string : Plural };

const DICTS: Record<Lang, Dict> = { pl, de, en };

let current: Lang = 'pl';

export const getLang = (): Lang => current;
export const locale = (lang: Lang = current) => LOCALES[lang];

/** Ustawia język interfejsu (nieznany → polski). */
export function setLang(lang: unknown) {
	current = isLang(lang) ? lang : 'pl';
}

export type Params = Record<string, string | number>;

const fill = (s: string, params?: Params) => (params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s);

/** Tekst w podanym języku (np. na serwerze dla innego języka niż bieżący). */
export function translate(lang: Lang, key: TextKey, params?: Params): string {
	const v = DICTS[lang][key] ?? DICTS.pl[key];
	return fill(typeof v === 'string' ? v : String(key), params);
}

/** Tekst w bieżącym języku; `{name}` w tekście zastępuje `params.name`. */
export const t = (key: TextKey, params?: Params): string => translate(current, key, params);

const rules = new Map<Lang, Intl.PluralRules>();

/** Forma liczby mnogiej dla `n` (PL: 1 / 2–4 / 5+, DE i EN: 1 / reszta); `{n}` = liczba. */
export function tn(key: PluralKey, n: number, params?: Params, lang: Lang = current): string {
	let r = rules.get(lang);
	if (!r) rules.set(lang, (r = new Intl.PluralRules(LOCALES[lang])));
	const forms = DICTS[lang][key] as Plural;
	const form = forms[r.select(n) as keyof Plural] ?? forms.other;
	return fill(form, { n, ...params });
}

/** Czy tekst jest kluczem słownika (np. etykiety zapisane w danych). */
export const isKey = (k: string): k is Key => k in pl;

/** Porównanie napisów wg bieżącego języka (sortowanie list). */
export const compare = (a: string, b: string) => a.localeCompare(b, LOCALES[current]);

export { DICTS };

/** Rzeczownik w środku zdania: małą literą – poza niemieckim, gdzie rzeczowniki zostają wielką. */
export const inSentence = (s: string) => (current === 'de' || !s ? s : s[0].toLocaleLowerCase(LOCALES[current]) + s.slice(1));
