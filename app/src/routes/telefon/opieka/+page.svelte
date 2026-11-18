<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { api, say } from '#lib/phone/toast.svelte.js';
	import { careInterval, careWhen, type CareView } from '#lib/logic/care.js';
	import { fmtShortDate } from '#lib/format.js';
	import { t } from '#lib/i18n/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	async function done(c: CareView) {
		try {
			const row = await api<{ id: number }>('/api/care/done', 'POST', { id: c.id });
			await invalidateAll();
			say(`${c.icon} ${c.name} ✓`, {
				ms: 8000,
				undo: async () => {
					await api('/api/care/undo', 'POST', { logId: row.id });
					await invalidateAll();
					say(t('phone.undone'));
				}
			});
		} catch (e) {
			say(t('common.failed', { label: (e as Error).message }), { error: true });
		}
	}
</script>

{#each data.items as c (c.id)}
	<div class="item {c.state}">
		<span class="ic">{c.icon}</span>
		<span class="what">
			<b>{c.name}</b>
			<span class="ph-muted">{careWhen(c, data.today)} · {careInterval(c)}{c.lastDone ? ` · ${t('care.last', { date: fmtShortDate(c.lastDone) })}` : ''}</span>
		</span>
		<button type="button" class="ph-btn" class:primary={c.actionable} onclick={() => done(c)} aria-label={t('care.markDone', { name: c.name })}>✓</button>
	</div>
{:else}
	<p class="ph-muted">{t('care.empty')}</p>
	<!-- --- 26b: guides --- pusty stan: administrator może od razu przejść do panelu -->
	{#if page.data.isAdmin}<p><a class="ph-btn" href="/admin/opieka" data-sveltekit-reload>{t('empty.phone.panel')} ›</a></p>{/if}
{/each}

<style>
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--card);
		border-radius: 14px;
		border-left: 7px solid #2f9e44;
		padding: 10px 12px;
		margin-bottom: 8px;
		box-shadow: var(--shadow);
	}
	.item.overdue {
		border-left-color: var(--alert);
	}
	.item.open {
		border-left-color: #e8a317;
	}
	.item.ok,
	.item.soon,
	.item.paused {
		opacity: 0.75;
	}
	.ic {
		font-size: 28px;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
