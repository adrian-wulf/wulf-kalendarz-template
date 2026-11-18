import type { Lang } from '#lib/i18n/index.js';

/** Układ klawiatury ekranowej – wspólny dla wszystkich okien; null = układ języka interfejsu. */
export const keyboardLayout = $state<{ current: Lang | null }>({ current: null });
