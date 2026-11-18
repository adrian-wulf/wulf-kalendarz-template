// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Login administratora (Tailscale, proxy, sesja hasła), gdy ma dostęp do panelu */
			admin?: string;
			/** Kto pyta – patrz lib/server/auth.ts (ustawia hooks.server.ts). */
			auth: import('#lib/server/auth.js').Identity;
			authMode: import('#lib/server/auth.js').AuthMode;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
