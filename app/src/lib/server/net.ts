import type { Fetcher } from './sources/index.js';
import { isDemo } from './demo/mode.js';
import { demoFetch } from './demo/fetch.js';

/**
 * Domyślny `fetch` serwera dla wszystkich źródeł i integracji. W trybie demo (`DEMO=1`) – atrapy
 * z `demo/fetch.ts`, więc demo nigdy nie łączy się z siecią (pogoda, odjazdy, Home Assistant, Google,
 * Bring!, WebDAV, adresy iCal wpisane w panelu). Testy dalej podają własny `f`.
 */
export const appFetch: Fetcher = (input, init) => (isDemo() ? demoFetch : fetch)(input, init);
