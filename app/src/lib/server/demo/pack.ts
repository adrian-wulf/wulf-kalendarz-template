import type { KidRepeat, Recurrence } from '#lib/server/db/schema.js';
import type { Country } from '#lib/region.js';
import type { Lang } from '#lib/i18n/index.js';
import { addDays, isoWeekday } from '#lib/logic/dates.js';
import { celebratesNameDay, namedaysOn } from '#lib/logic/namedays.js';

/**
 * Dane demo: spójna, fikcyjna rodzina na bieżący tydzień – wszystko liczone względem `today`.
 * Polska rodzina mieszka w Poznaniu, niemiecka (i angielskojęzyczna, `en`) w Hanowerze. Imiona,
 * przystanki, adresy i wydarzenia są wymyślone; kolory domowników nie kolidują z kolorami pojemników.
 *
 * One fictional family per language, every date relative to `today`. Pure data – `load.ts` writes it.
 */

type Text = Record<Lang, string>;
type Role = 'dad' | 'mum' | 'girl' | 'boy' | 'gran';

export interface DemoMember {
	id: string;
	role: Role;
	name: string;
	color: string;
	avatar: string;
	birthday: string;
	nameDay: string | null;
}

export interface DemoEvent {
	memberId: string | null;
	title: string;
	date: string;
	/** 'HH:MM'; brak = cały dzień */
	from: string | null;
	to: string | null;
	/** dni całodniowego wydarzenia (domyślnie 1) */
	days: number;
	location: string | null;
}

export interface DemoHaEntity {
	entityId: string;
	label: string;
	state: string;
	attributes: Record<string, unknown>;
}

export interface DemoLine {
	line: string;
	product: string;
	color: string;
	direction: string;
	/** co ile minut */
	every: number;
	/** pierwszy odjazd: minuta godziny */
	offset: number;
	platform: string;
	/** opóźnienie w minutach co drugiego kursu */
	delay: number;
}

export interface DemoPack {
	lang: Lang;
	country: Country;
	subdivision: string;
	timezone: string;
	location: { lat: number; lon: number; name: string };
	members: DemoMember[];
	events: DemoEvent[];
	notes: { text: string; memberId: string | null; days: number }[];
	shopping: { name: string; spec: string | null; icon: string }[];
	chores: { title: string; memberId: string | null; recurrence: Recurrence; startDate: string; doneToday?: boolean }[];
	recipes: { emoji: string; name: string; ingredients: string[] }[];
	plan: { date: string; slot: 'lunch' | 'dinner'; recipe?: number; text?: string }[];
	kidTasks: { memberId: string; title: string; emoji: string; points: number; repeat: KidRepeat; doneToday?: boolean }[];
	rewards: { title: string; emoji: string; cost: number }[];
	bonus: { memberId: string; delta: number }[];
	/** prośba o nagrodę czekająca na rodzica (indeks w `rewards`) */
	request: { memberId: string; reward: number } | null;
	countdowns: { title: string; emoji: string; date: string; yearly: boolean; memberId: string | null }[];
	meds: { memberId: string; name: string; dose: string; times: string[]; startDate: string | null; endDate: string | null }[];
	care: { name: string; icon: string; minDays: number; maxDays: number; memberId: string | null; lastDone: string }[];
	pantry: { name: string; place: 'spizarnia' | 'zamrazarka'; qty: number; addedAt: string }[];
	waste: { date: string; bin: string }[];
	ha: DemoHaEntity[];
	transit: { stop: { id: string; name: string }; lines: DemoLine[] };
	/** ferie dla atrapy OpenHolidays (nazwy jak w API) */
	ferien: { name: string; from: string; to: string }[];
	// --- 26a: calendar layers ---
	/** subskrypcja iCal klubu (atrapa w `fetch.ts` podaje `ics`) */
	club: { name: string; icon: string; color: string; memberId: string; url: string; ics: string };
	/** lokalny kalendarz szkoły – jak po imporcie pliku .ics od szkoły */
	school: { name: string; icon: string; color: string; memberId: string; events: { uid: string; title: string; date: string; from: string | null; to: string | null }[] };
}

/** Adres subskrypcji klubu w demo – obsługuje go atrapa (`fetch.ts`), nigdy sieć. */
export const DEMO_CLUB_URL = (lang: Lang) => `https://kalendarze.demo.invalid/klub-${lang}.ics`;

/** Kalendarz klubu jako plik iCal: treningi co tydzień (RRULE, strefa TZID), mecz i turniej. */
function clubIcs(lang: Lang, today: string, tz: string): string {
	const d = (n: number) => addDays(today, n).replaceAll('-', '');
	const esc = (v: string) => v.replace(/([,;\\])/g, '\\$1');
	const T = {
		cal: L('Orliki – terminarz', 'Adler U10 – Termine', 'Eagles U10 – fixtures'),
		training: L('Trening', 'Training', 'Training'),
		pitch: L('Boisko przy szkole nr 12', 'Sportplatz Lindenallee', 'Lime Avenue playing field'),
		match: L('Mecz: Orliki – Sokoły', 'Spiel: Adler – Füchse', 'Match: Eagles v Foxes'),
		cup: L('Turniej halowy', 'Hallenturnier', 'Indoor tournament')
	};
	const ev = (lines: string[]) => ['BEGIN:VEVENT', ...lines, `DTSTAMP:${d(0)}T080000Z`, 'END:VEVENT'];
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//kalendarz demo//klub//PL',
		`X-WR-CALNAME:${esc(T.cal[lang])}`,
		...ev([`UID:trening-${lang}@demo`, `DTSTART;TZID=${tz}:${d(2 - 14)}T170000`, `DTEND;TZID=${tz}:${d(2 - 14)}T181500`, 'RRULE:FREQ=WEEKLY;COUNT=12', `SUMMARY:${esc(T.training[lang])}`, `LOCATION:${esc(T.pitch[lang])}`]),
		...ev([`UID:mecz-${lang}@demo`, `DTSTART;TZID=${tz}:${d(4)}T093000`, `DTEND;TZID=${tz}:${d(4)}T110000`, `SUMMARY:${esc(T.match[lang])}`, `LOCATION:${esc(T.pitch[lang])}`]),
		...ev([`UID:turniej-${lang}@demo`, `DTSTART;VALUE=DATE:${d(11)}`, `DTEND;VALUE=DATE:${d(12)}`, `SUMMARY:${esc(T.cup[lang])}`]),
		'END:VCALENDAR'
	].join('\r\n');
}

/** Rodziny: PL – Poznań; DE i EN – Hanower. Region i miejsce do pogody idą za językiem demo. */
const FAMILY: Record<Lang, { names: Record<Role, string>; ids: Record<Role, string>; place: Pick<DemoPack, 'country' | 'subdivision' | 'timezone' | 'location'> }> = {
	pl: {
		ids: { dad: 'marek', mum: 'kasia', girl: 'zosia', boy: 'kuba', gran: 'babcia' },
		names: { dad: 'Marek', mum: 'Kasia', girl: 'Zosia', boy: 'Kuba', gran: 'Babcia' },
		place: { country: 'PL', subdivision: 'PL-WP', timezone: 'Europe/Warsaw', location: { lat: 52.41, lon: 16.93, name: 'Poznań' } }
	},
	de: {
		ids: { dad: 'jonas', mum: 'lena', girl: 'mia', boy: 'paul', gran: 'oma' },
		names: { dad: 'Jonas', mum: 'Lena', girl: 'Mia', boy: 'Paul', gran: 'Oma' },
		place: { country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin', location: { lat: 52.37, lon: 9.74, name: 'Hannover' } }
	},
	en: {
		ids: { dad: 'tom', mum: 'emma', girl: 'lily', boy: 'max', gran: 'grandma' },
		names: { dad: 'Tom', mum: 'Emma', girl: 'Lily', boy: 'Max', gran: 'Grandma' },
		place: { country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin', location: { lat: 52.37, lon: 9.74, name: 'Hannover' } }
	}
};

/** Kolory z palety domowników – daleko od kolorów pojemników PL i DE. */
const COLORS: Record<Role, string> = { dad: '#0ea5e9', mum: '#e0457b', girl: '#8b5cf6', boy: '#f2994a', gran: '#0f766e' };
const AVATARS: Record<Role, string> = { dad: '🚴', mum: '🌻', girl: '🦊', boy: '🦖', gran: '🧶' };

/**
 * Imiona żeńskie (mianownik) do imienin babci: w Polsce babcia „obchodzi” imieniny z dzisiejszej
 * listy, więc kafelek imienin w demo zawsze ma kogo pokazać (gdy w kalendarzu jest takie imię).
 */
const GRAN_NAMES = [
	'Halina', 'Anna', 'Maria', 'Krystyna', 'Barbara', 'Teresa', 'Elżbieta', 'Zofia', 'Jadwiga', 'Danuta', 'Irena', 'Helena', 'Janina', 'Wanda',
	'Renata', 'Urszula', 'Bożena', 'Jolanta', 'Grażyna', 'Stanisława', 'Genowefa', 'Lucyna', 'Marianna', 'Aniela', 'Gertruda', 'Salomea',
	'Cecylia', 'Klementyna', 'Kinga', 'Agnieszka', 'Dorota', 'Ewa', 'Beata', 'Alicja', 'Joanna', 'Bogumiła', 'Leokadia', 'Jagoda', 'Michalina',
	'Weronika', 'Józefa', 'Rozalia', 'Eugenia', 'Ludmiła', 'Bronisława', 'Kazimiera', 'Władysława', 'Feliksa', 'Apolonia', 'Agata',
	'Łucja', 'Małgorzata', 'Magdalena', 'Katarzyna', 'Hanna', 'Elwira', 'Regina', 'Sabina', 'Wiesława', 'Zuzanna', 'Edyta', 'Iwona',
	'Natalia', 'Patrycja', 'Paulina', 'Olga', 'Emilia', 'Adela', 'Benedykta', 'Gabriela', 'Kunegunda', 'Monika', 'Wiktoria'
];

export function granNameDay(today: string): string {
	const names = namedaysOn(today);
	return GRAN_NAMES.find((n) => celebratesNameDay(n, names)) ?? 'Halina';
}

const L = (pl: string, de: string, en: string): Text => ({ pl, de, en });

/** Urodziny `inDays` dni od dziś w roku `year` – zawsze w tygodniu demo. */
const birthdayIn = (today: string, inDays: number, year: number) => `${year}-${addDays(today, inDays).slice(5)}`;

// --- Wydarzenia: [dzień, kto, od, do, tytuł, miejsce?, dni całodniowego] ---

type EventSpec = [d: number, who: Role | null, from: string | null, to: string | null, title: Text, where?: Text | null, days?: number];

const EVENTS: EventSpec[] = [
	[-1, 'girl', '17:00', '18:00', L('Basen', 'Schwimmen', 'Swimming'), L('Pływalnia miejska', 'Hallenbad', 'Indoor pool')],
	[-1, 'mum', '19:30', '20:30', L('Joga', 'Yoga', 'Yoga')],
	[0, 'girl', '16:30', '17:30', L('Basen', 'Schwimmen', 'Swimming'), L('Pływalnia miejska', 'Hallenbad', 'Indoor pool')],
	[0, 'dad', '18:00', '19:00', L('Zebranie w szkole', 'Elternabend', 'Parents’ evening')],
	[1, 'boy', null, null, L('Wycieczka do zoo', 'Kita-Ausflug in den Zoo', 'Nursery trip to the zoo')],
	[1, 'gran', '10:30', '11:15', L('Kardiolog', 'Kardiologe', 'Cardiologist')],
	[1, 'girl', '17:00', '18:00', L('Angielski', 'Klavierstunde', 'Piano lesson')],
	[1, 'mum', '19:30', '20:30', L('Joga', 'Yoga', 'Yoga')],
	[2, 'dad', null, null, L('Delegacja – Wrocław', 'Dienstreise Hamburg', 'Work trip to Hamburg'), null, 2],
	[2, 'mum', '18:00', '19:00', L('Fryzjer', 'Friseur', 'Hairdresser')],
	[3, null, '16:00', '18:30', L('Przyjęcie urodzinowe Zosi', 'Mias Party', 'Lily’s party')],
	[4, 'dad', '08:00', '09:00', L('Przegląd auta', 'Auto – Inspektion', 'Car service')],
	[4, 'girl', '16:30', '17:30', L('Basen', 'Schwimmen', 'Swimming'), L('Pływalnia miejska', 'Hallenbad', 'Indoor pool')],
	[5, 'boy', '11:00', '13:00', L('Urodziny Stasia', 'Geburtstag bei Ben', 'Ben’s birthday party'), L('Sala zabaw „Bąbel”', 'Indoorspielplatz', 'Soft play centre')],
	[5, 'mum', '19:00', '22:00', L('Kolacja ze znajomymi', 'Essen mit Freunden', 'Dinner with friends')],
	[6, 'boy', '10:00', '11:00', L('Basen z tatą', 'Schwimmen mit Papa', 'Swimming with Dad'), L('Pływalnia miejska', 'Hallenbad', 'Indoor pool')],
	[6, null, '13:00', '15:00', L('Obiad u babci', 'Mittagessen bei Oma', 'Lunch at Grandma’s')],
	[7, 'mum', '09:00', '09:45', L('Dentysta', 'Zahnarzt', 'Dentist')],
	[8, 'girl', '17:00', '18:00', L('Angielski', 'Klavierstunde', 'Piano lesson')],
	[9, null, '18:00', '20:00', L('Teatr – „Calineczka”', 'Theater: „Die Schneekönigin“', 'Theatre: “The Snow Queen”')],
	[12, 'gran', '11:00', '12:00', L('Lekarz rodzinny', 'Hausarzt', 'GP appointment')]
];

const NOTES: [who: Role | null, days: number, text: Text][] = [
	['mum', 2, L('Odebrać paczkę z paczkomatu 📦', 'Paket an der Packstation abholen 📦', 'Pick up the parcel from the locker 📦')],
	['dad', 3, L('Podpisać zgodę na wycieczkę Zosi', 'Einverständnis für Mias Ausflug unterschreiben', 'Sign Lily’s school trip form')],
	[null, 1, L('Zupa w lodówce na jutro 🍲', 'Suppe im Kühlschrank für morgen 🍲', 'Soup in the fridge for tomorrow 🍲')]
];

const SHOPPING: [icon: string, name: Text, spec?: Text][] = [
	['🥛', L('Mleko', 'Milch', 'Milk')],
	['🍞', L('Chleb', 'Brot', 'Bread')],
	['🧈', L('Masło', 'Butter', 'Butter')],
	['🍎', L('Jabłka', 'Äpfel', 'Apples'), L('1 kg', '1 kg', '1 kg')],
	['🥚', L('Jajka', 'Eier', 'Eggs'), L('10 szt.', '10 Stück', '10')],
	['🍅', L('Pomidory', 'Tomaten', 'Tomatoes')],
	['☕', L('Kawa', 'Kaffee', 'Coffee'), L('ziarnista', 'Bohnen', 'beans')],
	['🧻', L('Ręczniki papierowe', 'Küchenrolle', 'Kitchen roll')]
];

const RECIPES: [emoji: string, name: Text, ingredients: Text][] = [
	['🍝', L('Spaghetti', 'Spaghetti Bolognese', 'Spaghetti bolognese'), L('500 g makaron spaghetti|400 g mięso mielone|1 puszka pomidory|1 cebula|2 ząbki czosnek', 'Spaghetti 500 g|Hackfleisch 400 g|Dosentomaten 1 Dose|Zwiebel 1|Knoblauch 2 Zehen', 'spaghetti 500 g|minced beef 400 g|chopped tomatoes 1 tin|onion 1|garlic 2 cloves')],
	['🥞', L('Naleśniki', 'Pfannkuchen', 'Pancakes'), L('250 g mąka|2 jajka|500 ml mleko|250 g twaróg', 'Mehl 250 g|Eier 2|Milch 500 ml|Apfelmus 1 Glas', 'flour 250 g|eggs 2|milk 500 ml|lemon 1')],
	['🍲', L('Pomidorowa', 'Tomatensuppe', 'Tomato soup'), L('1 l bulion|1 puszka pomidory|200 g ryż|śmietana', 'Gemüsebrühe 1 l|Dosentomaten 1 Dose|Reis 200 g|Sahne', 'vegetable stock 1 l|chopped tomatoes 1 tin|rice 200 g|cream')],
	['🎃', L('Krem z dyni', 'Kürbissuppe', 'Pumpkin soup'), L('1 dynia hokkaido|1 cebula|1 l bulion|mleko kokosowe', 'Hokkaido-Kürbis 1|Zwiebel 1|Gemüsebrühe 1 l|Kokosmilch 1 Dose', 'pumpkin 1|onion 1|vegetable stock 1 l|coconut milk 1 tin')],
	['🍗', L('Kurczak z pieca', 'Ofenhähnchen', 'Roast chicken'), L('600 g kurczak|4 ziemniaki|2 marchewki|1 papryka', 'Hähnchenschenkel 600 g|Kartoffeln 4|Möhren 2|Paprika 1', 'chicken thighs 600 g|potatoes 4|carrots 2|pepper 1')],
	['🐟', L('Łosoś z koperkiem', 'Lachs mit Dill', 'Salmon and potatoes'), L('400 g łosoś|800 g ziemniaki|koperek|cytryna', 'Lachs 400 g|Kartoffeln 800 g|Dill|Zitrone 1', 'salmon 400 g|potatoes 800 g|dill|lemon 1')],
	['🍕', L('Pizza domowa', 'Pizza selbst gemacht', 'Homemade pizza'), L('500 g mąka|1 drożdże|1 puszka pomidory|200 g mozzarella', 'Mehl 500 g|Hefe 1|Dosentomaten 1 Dose|Mozzarella 200 g', 'flour 500 g|yeast 1|chopped tomatoes 1 tin|mozzarella 200 g')],
	['🥗', L('Sałatka grecka', 'Griechischer Salat', 'Greek salad'), L('2 pomidory|1 ogórek|200 g feta|oliwki', 'Tomaten 2|Gurke 1|Feta 200 g|Oliven', 'tomatoes 2|cucumber 1|feta 200 g|olives')],
	['🥟', L('Pierogi ruskie', 'Maultaschen', 'Dumplings'), L('500 g pierogi|1 cebula|śmietana', 'Maultaschen 500 g|Zwiebel 1|Butter', 'dumplings 500 g|onion 1|sour cream')]
];

/** Plan obiadów (i kilku kolacji) na tydzień – indeksy w RECIPES albo sam tekst. */
const PLAN: [d: number, slot: 'lunch' | 'dinner', what: number | Text][] = [
	[-1, 'lunch', 8],
	[0, 'lunch', 3],
	[0, 'dinner', L('Kanapki', 'Abendbrot', 'Sandwiches')],
	[1, 'lunch', 0],
	[1, 'dinner', 7],
	[2, 'lunch', 4],
	[3, 'lunch', 6],
	[3, 'dinner', L('Tort urodzinowy 🎂', 'Geburtstagskuchen 🎂', 'Birthday cake 🎂')],
	[4, 'lunch', 5],
	[5, 'lunch', 1],
	[6, 'lunch', L('Obiad u babci', 'Mittagessen bei Oma', 'Lunch at Grandma’s')],
	[7, 'lunch', 2]
];

const KID_TASKS: [who: 'girl' | 'boy', emoji: string, points: number, repeat: KidRepeat, title: Text, doneToday?: boolean][] = [
	['girl', '🛏️', 1, { type: 'daily' }, L('Pościelić łóżko', 'Bett machen', 'Make the bed'), true],
	['girl', '📚', 2, { type: 'days', days: [1, 2, 3, 4, 5] }, L('Odrobić lekcje', 'Hausaufgaben', 'Homework')],
	['girl', '🍽️', 2, { type: 'daily' }, L('Rozładować zmywarkę', 'Spülmaschine ausräumen', 'Empty the dishwasher'), true],
	['girl', '🧹', 5, { type: 'weekly' }, L('Posprzątać pokój', 'Zimmer aufräumen', 'Tidy your room')],
	['boy', '🪥', 1, { type: 'daily' }, L('Umyć zęby', 'Zähne putzen', 'Brush your teeth'), true],
	['boy', '🧸', 1, { type: 'daily' }, L('Odłożyć zabawki', 'Spielsachen wegräumen', 'Put toys away')],
	['boy', '🌱', 2, { type: 'weekly' }, L('Podlać kwiatki', 'Blumen gießen', 'Water the plants')]
];

const REWARDS: [emoji: string, cost: number, title: Text][] = [
	['📱', 10, L('30 minut tabletu', '30 Minuten Tablet', '30 minutes of tablet time')],
	['🍦', 15, L('Lody w weekend', 'Eis am Wochenende', 'Ice cream at the weekend')],
	['🎲', 20, L('Wieczór gier – ja wybieram', 'Spieleabend – ich wähle', 'Games night – I choose')],
	['🎬', 40, L('Wyjście do kina', 'Kinobesuch', 'Trip to the cinema')]
];

export function demoPack(lang: Lang, today: string): DemoPack {
	const fam = FAMILY[lang];
	const id = (r: Role | null) => (r ? fam.ids[r] : null);
	const year = Number(today.slice(0, 4));
	const wd = isoWeekday(today);
	const wdOf = (d: number) => isoWeekday(addDays(today, d));

	const members: DemoMember[] = (['dad', 'mum', 'girl', 'boy', 'gran'] as const).map((role) => ({
		id: fam.ids[role],
		role,
		name: fam.names[role],
		color: COLORS[role],
		avatar: AVATARS[role],
		// Zosia/Mia/Lily kończy 10 lat za 3 dni (impreza w kalendarzu), mama ma urodziny za 11 dni.
		birthday: { dad: '1985-04-17', mum: birthdayIn(today, 11, 1987), girl: birthdayIn(today, 3, year - 10), boy: '2020-06-02', gran: '1956-02-08' }[role],
		nameDay: lang === 'pl' ? { dad: null, mum: 'Katarzyna', girl: 'Zofia', boy: 'Jakub', gran: granNameDay(today) }[role] : null
	}));

	const events: DemoEvent[] = EVENTS.map(([d, who, from, to, title, where, days]) => ({
		memberId: id(who),
		title: title[lang],
		date: addDays(today, d),
		from,
		to,
		days: days ?? 1,
		location: where?.[lang] ?? null
	}));

	const recipes = RECIPES.map(([emoji, name, ing]) => ({ emoji, name: name[lang], ingredients: ing[lang].split('|') }));

	// Ferie: ten i przyszły rok (nazwy jak w OpenHolidays – tłumaczy je `ferienTitle`).
	const ferien = [year, year + 1].flatMap((y) =>
		fam.place.country === 'PL'
			? [
					{ name: 'Ferie zimowe', from: `${y}-01-18`, to: `${y}-01-31` },
					{ name: 'Ferie letnie', from: `${y}-06-27`, to: `${y}-08-31` },
					{ name: 'Zimowa przerwa świąteczna', from: `${y}-12-22`, to: `${y}-12-31` }
				]
			: [
					{ name: 'Halbjahresferien', from: `${y}-02-01`, to: `${y}-02-02` },
					{ name: 'Osterferien', from: `${y}-03-23`, to: `${y}-04-07` },
					{ name: 'Sommerferien', from: `${y}-07-02`, to: `${y}-08-12` },
					{ name: 'Herbstferien', from: `${y}-10-12`, to: `${y}-10-24` },
					{ name: 'Weihnachtsferien', from: `${y}-12-23`, to: `${y + 1}-01-08` }
				]
	);

	return {
		lang,
		...fam.place,
		members,
		events,
		notes: NOTES.map(([who, days, text]) => ({ text: text[lang], memberId: id(who), days })),
		shopping: SHOPPING.map(([icon, name, spec]) => ({ icon, name: name[lang], spec: spec?.[lang] ?? null })),
		chores: [
			// Dziś: odkurzanie (tata) i kwiaty (wszyscy); wczorajsze pranie zaległe – kafelek ma co pokazać.
			{ title: L('Odkurzanie', 'Staubsaugen', 'Hoovering')[lang], memberId: id('dad'), recurrence: { type: 'weekly', days: [wd] }, startDate: addDays(today, -28) },
			{ title: L('Podlać kwiaty', 'Blumen gießen', 'Water the plants')[lang], memberId: null, recurrence: { type: 'weekly', days: [wd, wdOf(3)] }, startDate: addDays(today, -28) },
			{ title: L('Pranie ręczników', 'Handtücher waschen', 'Wash the towels')[lang], memberId: id('mum'), recurrence: { type: 'weekly', days: [wdOf(-1)] }, startDate: addDays(today, -28) },
			{ title: L('Wynieść makulaturę', 'Altpapier rausbringen', 'Take out the recycling')[lang], memberId: id('girl'), recurrence: { type: 'weekly', days: [wd] }, startDate: addDays(today, -28), doneToday: true },
			{ title: L('Rachunek za prąd', 'Stromrechnung prüfen', 'Pay the electricity bill')[lang], memberId: id('mum'), recurrence: { type: 'monthly', day: Number(addDays(today, 5).slice(8)) }, startDate: addDays(today, -3) }
		],
		recipes,
		plan: PLAN.map(([d, slot, what]) => (typeof what === 'number' ? { date: addDays(today, d), slot, recipe: what } : { date: addDays(today, d), slot, text: what[lang] })),
		kidTasks: KID_TASKS.map(([who, emoji, points, repeat, title, doneToday]) => ({ memberId: fam.ids[who], emoji, points, repeat, title: title[lang], doneToday })),
		rewards: REWARDS.map(([emoji, cost, title]) => ({ emoji, cost, title: title[lang] })),
		bonus: [
			{ memberId: fam.ids.girl, delta: 21 },
			{ memberId: fam.ids.boy, delta: 8 }
		],
		request: { memberId: fam.ids.girl, reward: 0 },
		countdowns: [
			{ title: L('Wigilia', 'Heiligabend', 'Christmas Eve')[lang], emoji: '🎄', date: `${year}-12-24`, yearly: true, memberId: null },
			{ title: L('Ferie w górach', 'Skiurlaub', 'Ski holiday')[lang], emoji: '⛷️', date: addDays(today, 66), yearly: false, memberId: null },
			{ title: L('Teatr – „Calineczka”', 'Theater: „Die Schneekönigin“', 'Theatre: “The Snow Queen”')[lang], emoji: '🎭', date: addDays(today, 9), yearly: false, memberId: null },
			{ title: L('Wakacje nad jeziorem', 'Sommerurlaub an der Ostsee', 'Summer holiday by the sea')[lang], emoji: '🏕️', date: addDays(today, 214), yearly: false, memberId: null }
		],
		meds: [
			{ memberId: fam.ids.gran, name: L('Lek na ciśnienie', 'Blutdrucktablette', 'Blood pressure tablet')[lang], dose: L('1 tabl.', '1 Tbl.', '1 tablet')[lang], times: ['08:00', '20:00'], startDate: addDays(today, -40), endDate: null },
			{ memberId: fam.ids.boy, name: L('Syrop na kaszel', 'Hustensaft', 'Cough syrup')[lang], dose: '5 ml', times: ['08:00', '14:00', '20:00'], startDate: addDays(today, -2), endDate: addDays(today, 4) },
			{ memberId: fam.ids.dad, name: L('Witamina D', 'Vitamin D', 'Vitamin D')[lang], dose: L('1 kaps.', '1 Kapsel', '1 capsule')[lang], times: ['08:00'], startDate: addDays(today, -40), endDate: null }
		],
		care: [
			{ name: 'Monstera', icon: '🪴', minDays: 7, maxDays: 10, memberId: null, lastDone: addDays(today, -9) },
			{ name: L('Zioła na parapecie', 'Kräuter auf der Fensterbank', 'Herbs on the windowsill')[lang], icon: '🌿', minDays: 2, maxDays: 3, memberId: id('girl'), lastDone: addDays(today, -1) },
			{ name: L('Filtr w dzbanku', 'Wasserfilter wechseln', 'Water filter')[lang], icon: '💧', minDays: 28, maxDays: 30, memberId: null, lastDone: addDays(today, -25) },
			{ name: L('Odkamienianie ekspresu', 'Kaffeemaschine entkalken', 'Descale the coffee machine')[lang], icon: '☕', minDays: 28, maxDays: 42, memberId: id('dad'), lastDone: addDays(today, -44) },
			{ name: L('Karmnik dla ptaków', 'Vogelhaus auffüllen', 'Refill the bird feeder')[lang], icon: '🐦', minDays: 5, maxDays: 7, memberId: id('boy'), lastDone: addDays(today, -4) },
			{ name: L('Ciśnienie w oponach', 'Reifendruck prüfen', 'Check tyre pressure')[lang], icon: '🚗', minDays: 30, maxDays: 45, memberId: id('dad'), lastDone: addDays(today, -12) }
		],
		pantry: [
			{ name: L('Makaron spaghetti', 'Spaghetti', 'Spaghetti')[lang], place: 'spizarnia', qty: 3, addedAt: addDays(today, -10) },
			{ name: L('Pomidory w puszce', 'Dosentomaten', 'Tinned tomatoes')[lang], place: 'spizarnia', qty: 4, addedAt: addDays(today, -10) },
			{ name: L('Ryż', 'Reis', 'Rice')[lang], place: 'spizarnia', qty: 2, addedAt: addDays(today, -20) },
			{ name: L('Mąka', 'Mehl', 'Flour')[lang], place: 'spizarnia', qty: 1, addedAt: addDays(today, -20) },
			{ name: L('Pierogi ruskie', 'Erbsen', 'Frozen peas')[lang], place: 'zamrazarka', qty: 2, addedAt: addDays(today, -21) },
			{ name: L('Rosół', 'Hühnersuppe', 'Chicken soup')[lang], place: 'zamrazarka', qty: 3, addedAt: addDays(today, -6) },
			{ name: L('Jagody', 'Heidelbeeren', 'Blueberries')[lang], place: 'zamrazarka', qty: 1, addedAt: addDays(today, -95) },
			{ name: L('Lody waniliowe', 'Vanilleeis', 'Vanilla ice cream')[lang], place: 'zamrazarka', qty: 1, addedAt: addDays(today, -12) }
		],
		// Wywozy z gotowego zestawu pojemników kraju (jutro bio – dziś wieczorem „wystaw”).
		waste: (fam.place.country === 'PL'
			? ([[1, 'bio'], [2, 'zmieszane'], [4, 'metale'], [8, 'bio'], [9, 'papier'], [15, 'bio'], [16, 'zmieszane'], [18, 'metale'], [22, 'szklo'], [23, 'papier']] as const)
			: ([[1, 'bio'], [2, 'rest'], [4, 'gelb'], [8, 'bio'], [9, 'papier'], [15, 'bio'], [16, 'rest'], [18, 'gelb'], [23, 'papier']] as const)
		).map(([d, bin]) => ({ date: addDays(today, d), bin })),
		ha: HA[lang],
		transit: TRANSIT[fam.place.country],
		ferien,
		club: {
			name: L('Piłka nożna Kuby', 'Fußball Paul', 'Max’s football')[lang],
			icon: '⚽',
			color: '#16a34a',
			memberId: fam.ids.boy,
			url: DEMO_CLUB_URL(lang),
			ics: clubIcs(lang, today, fam.place.timezone)
		},
		school: {
			name: L('Szkoła Zosi', 'Schule Mia', 'Lily’s school')[lang],
			icon: '🏫',
			color: '#2563eb',
			memberId: fam.ids.girl,
			events: (
				[
					[1, null, null, L('Dzień sportu', 'Sportfest', 'Sports day')],
					[8, '18:00', '19:30', L('Wywiadówka', 'Elternsprechtag', 'Parent–teacher meeting')],
					[10, null, null, L('Wycieczka do muzeum', 'Museumsausflug', 'Museum trip')],
					[17, null, null, L('Dzień wolny od zajęć', 'Unterrichtsfreier Tag', 'Teacher training day')]
				] as const
			).map(([n, from, to, title], i) => ({ uid: `szkola-${i}@demo`, title: title[lang], date: addDays(today, n), from, to }))
		}
	};
}

const HA: Record<Lang, DemoHaEntity[]> = {
	pl: [
		{ entityId: 'sensor.salon_temperatura', label: 'Salon', state: '21.6', attributes: { friendly_name: 'Salon', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.kuchnia', label: 'Kuchnia', state: 'on', attributes: { friendly_name: 'Kuchnia' } },
		{ entityId: 'lock.drzwi_wejsciowe', label: 'Drzwi wejściowe', state: 'locked', attributes: { friendly_name: 'Drzwi wejściowe' } },
		{ entityId: 'switch.lampki_balkon', label: 'Lampki na balkonie', state: 'off', attributes: { friendly_name: 'Lampki na balkonie' } },
		{ entityId: 'sensor.dwor_temperatura', label: 'Na zewnątrz', state: '6.4', attributes: { friendly_name: 'Na zewnątrz', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.salon', label: 'Lampa w salonie', state: 'off', attributes: { friendly_name: 'Lampa w salonie' } },
	],
	de: [
		{ entityId: 'sensor.wohnzimmer_temperatur', label: 'Wohnzimmer', state: '21.6', attributes: { friendly_name: 'Wohnzimmer', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.kueche', label: 'Küche', state: 'on', attributes: { friendly_name: 'Küche' } },
		{ entityId: 'lock.haustuer', label: 'Haustür', state: 'locked', attributes: { friendly_name: 'Haustür' } },
		{ entityId: 'switch.balkon_lichterkette', label: 'Lichterkette Balkon', state: 'off', attributes: { friendly_name: 'Lichterkette Balkon' } },
		{ entityId: 'sensor.aussen_temperatur', label: 'Draußen', state: '6.4', attributes: { friendly_name: 'Draußen', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.wohnzimmer', label: 'Stehlampe', state: 'off', attributes: { friendly_name: 'Stehlampe' } },
	],
	en: [
		{ entityId: 'sensor.living_room_temperature', label: 'Living room', state: '21.6', attributes: { friendly_name: 'Living room', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.kitchen', label: 'Kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } },
		{ entityId: 'lock.front_door', label: 'Front door', state: 'locked', attributes: { friendly_name: 'Front door' } },
		{ entityId: 'switch.balcony_lights', label: 'Balcony lights', state: 'off', attributes: { friendly_name: 'Balcony lights' } },
		{ entityId: 'sensor.outside_temperature', label: 'Outside', state: '6.4', attributes: { friendly_name: 'Outside', unit_of_measurement: '°C', device_class: 'temperature' } },
		{ entityId: 'light.living_room', label: 'Floor lamp', state: 'off', attributes: { friendly_name: 'Floor lamp' } },
	]
};

/** Wymyślone przystanki i kierunki; numery linii jak w typowej sieci tramwajowo-autobusowej. */
const TRANSIT: Record<Country, DemoPack['transit']> = {
	PL: {
		stop: { id: 'demo-rondo-lipowe', name: 'Rondo Lipowe' },
		lines: [
			{ line: '5', product: 'tram', color: '#1d6fb8', direction: 'Dworzec Główny', every: 10, offset: 3, platform: '1', delay: 2 },
			{ line: '16', product: 'tram', color: '#1d6fb8', direction: 'Os. Słoneczne', every: 12, offset: 7, platform: '2', delay: 0 },
			{ line: '174', product: 'bus', color: '#6b7280', direction: 'Os. Zielone', every: 20, offset: 5, platform: '3', delay: 4 },
			{ line: '9', product: 'tram', color: '#1d6fb8', direction: 'Stare Miasto', every: 15, offset: 11, platform: '1', delay: 0 }
		]
	},
	DE: {
		stop: { id: 'demo-lindenplatz', name: 'Lindenplatz' },
		lines: [
			{ line: '3', product: 'tram', color: '#0f6e3a', direction: 'Hauptbahnhof', every: 10, offset: 4, platform: '1', delay: 1 },
			{ line: '7', product: 'tram', color: '#0f6e3a', direction: 'Am Lindenhof', every: 10, offset: 9, platform: '2', delay: 0 },
			{ line: '100', product: 'bus', color: '#6b7280', direction: 'Südstadt', every: 15, offset: 2, platform: '3', delay: 3 },
			{ line: '128', product: 'bus', color: '#6b7280', direction: 'Nordpark', every: 20, offset: 12, platform: '4', delay: 0 }
		]
	}
};
