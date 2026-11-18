import { fmtTime } from '#lib/format.js';
import { localZone } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';

/** Wynik akcji `act()`: klucz sekcji + ✓ albo błąd. */
export type ActionResult = { section?: string; ok?: boolean; error?: string } | null | undefined;

/** Komunikat tylko przy sekcji, która wysłała formularz. */
export const msg = (form: ActionResult, section: string) => (form?.section === section ? form : null);

/** Dymek po zapisie wiersza (✓ / błąd) – pokazuje go układ panelu. */
export const rowStatus = $state<{ current: { el: HTMLFormElement; ok: boolean; text: string } | null }>({ current: null });

/** Zapis bez czyszczenia pól; komunikat (✓ / błąd) przy formularzu, który go wysłał. */
export const keep =
	({ formElement }: { formElement: HTMLFormElement }) =>
	async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		const err = result.type === 'failure' ? String(result.data?.error ?? t('admin.saveFailed')) : result.type === 'error' ? t('admin.serverError') : null;
		rowStatus.current = { el: formElement, ok: !err, text: err ?? `✓ ${t('admin.saved')}` };
		setTimeout(() => rowStatus.current?.el === formElement && (rowStatus.current = null), 4000);
	};

/** Zapis bez czyszczenia pól (formularze ustawień). */
export const noReset = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });

export const localInput = (iso: string) =>
	new Intl.DateTimeFormat('sv-SE', { timeZone: localZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
		.format(new Date(iso))
		.replace(' ', 'T');

export const ago = (iso: string | null) => {
	if (!iso) return t('admin.never');
	const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
	return min < 1 ? t('admin.justNow') : min < 60 ? t('admin.minAgo', { n: min }) : `${fmtTime(iso)}`;
};

/** Domownik w panelu (dane z układu /admin). */
export interface AdminMember {
	id: string;
	name: string;
	color: string;
	calendarIds: string[];
	emails: string[];
	avatar: string | null;
	birthday: string | null;
	nameDay: string | null;
}

export const memberName = (members: AdminMember[], id: string | null) => members.find((m) => m.id === id)?.name ?? t('common.everyone');
export const memberColor = (members: AdminMember[], id: string | null) => members.find((m) => m.id === id)?.color ?? 'var(--muted)';
