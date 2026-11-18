/** Domownik używający telefonu: z Tailscale albo wybrany ręcznie (zapamiętany w przeglądarce). */
export const me = $state<{ id: string | null }>({ id: null });

const KEY = 'telefonDomownik';

export function rememberedMember(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function chooseMember(id: string) {
	me.id = id;
	// Ciasteczko (rok): serwer zna wybór także w trybie hasła i po wyczyszczeniu localStorage.
	// To tylko preferencja widoku, nie uprawnienie – dlatego bez HttpOnly.
	try {
		document.cookie = `kal_member=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
	} catch {
		/* bez ciasteczek – zostaje localStorage */
	}
	try {
		localStorage.setItem(KEY, id);
	} catch {
		/* tryb prywatny – wybór tylko do zamknięcia strony */
	}
}
