// Stały zegar serwera dla zrzutów ekranu (`npm run screenshots`): `node --import ./scripts/fake-clock.mjs server`
// z FAKE_NOW=ISO. Zegar stoi na FAKE_NOW (FAKE_CLOCK_RUN=1 – startuje od FAKE_NOW i płynie dalej), więc dane
// demo, pogoda, odjazdy i „dziś” są zawsze te same, niezależnie od dnia, w którym robi się zrzuty.
// Tylko narzędzie – aplikacja go nie używa.
// Fixed server clock for deterministic screenshots (tooling only, never loaded by the app itself).
const start = Date.parse(process.env.FAKE_NOW ?? '');
if (Number.isFinite(start)) {
	const RealDate = Date;
	const realNow = RealDate.now();
	const run = process.env.FAKE_CLOCK_RUN === '1';
	const now = () => (run ? start + (RealDate.now() - realNow) : start);
	class FakeDate extends RealDate {
		constructor(...args) {
			if (args.length === 0) super(now());
			else super(...args);
		}
		static now() {
			return now();
		}
	}
	globalThis.Date = FakeDate;
	console.log(`[fake-clock] ${new RealDate(start).toISOString()}`);
}
