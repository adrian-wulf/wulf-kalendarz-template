import { authConfig, type AuthConfig } from './auth.js';

/** Konfiguracja logowania z .env – jedna na proces (hooks, /login, panel, kiosk). */
let cfg: AuthConfig | undefined;
export const runtimeAuth = (): AuthConfig => (cfg ??= authConfig());
