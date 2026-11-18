import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { requestReward } from '#lib/server/kids.js';

/** Prośba dziecka o nagrodę: `{ memberId, rewardId }` – czeka na zgodę rodzica. */
export const POST = ({ request }) => handle(request, (b) => requestReward(getDb(), b));
