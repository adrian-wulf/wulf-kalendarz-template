/**
 * Trasy, które kiosk wykona tylko po PIN-ie, gdy w panelu włączono „PIN przy usuwaniu”:
 * usuwanie kartek, zapasów, odliczań i wydarzeń. Odhaczanie zakupów i zadań to codzienna czynność
 * (z „Cofnij”), a usunięcie wpisu węży na kiosku to tylko „Cofnij” świeżego wpisu – bez PIN-u.
 * Zgoda na nagrodę z kiosku wymaga PIN-u zawsze (api/kids/decide).
 *
 * Kiosk routes that need a fresh PIN grant when "PIN for deleting" is on.
 */
const GUARDED: [method: string, path: RegExp][] = [
	['DELETE', /^\/api\/notes\/[^/]+$/],
	['DELETE', /^\/api\/pantry\/items\/[^/]+$/],
	['DELETE', /^\/api\/countdown\/[^/]+$/],
	['DELETE', /^\/api\/events(\/[^/]+)?$/]
];

export const pinGuarded = (method: string, path: string) => GUARDED.some(([m, re]) => m === method.toUpperCase() && re.test(path));
