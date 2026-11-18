<script lang="ts">
	import { LANGUAGES, stepLabel, type StepId } from '#lib/setup.js';
	import { presetById } from '#lib/theme.js';
	import { presetName } from '#lib/layout.js';
	import { locale, t } from '#lib/i18n/index.js';
	import type { SetupData } from '#lib/server/setup.js';

	let { data, go }: { data: SetupData; go: (step: StepId) => void } = $props();

	const sub = $derived(data.region ? data.subdivisions[data.region.country].find((s) => s.code === data.region!.subdivision)?.name : null);
	const country = $derived(data.countries.find((c) => c.code === data.region?.country)?.name);
	const on = $derived(data.modules.filter((m) => m.enabled));
	const off = $derived(data.modules.filter((m) => !m.enabled));
	const fmt = (n: number) => n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const admin = $derived(data.adminUrl ?? t('setup.summary.adminUrl'));
</script>

<div class="layout">
<dl class="sum">
	<div>
		<dt>{stepLabel('lang')}</dt>
		<dd>{LANGUAGES.find((l) => l.code === data.language)?.name}</dd>
		<button type="button" class="link" onclick={() => go('lang')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('region')}</dt>
		<dd>{country}, {sub} <span class="muted">· {data.region?.timezone}</span></dd>
		<button type="button" class="link" onclick={() => go('region')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('place')}</dt>
		<dd>{data.place?.name || t('setup.place.ownCoords')} <span class="muted">· {data.place ? `${fmt(data.place.lat)}, ${fmt(data.place.lon)}` : ''}</span></dd>
		<button type="button" class="link" onclick={() => go('place')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('members')}</dt>
		<dd class="people">
			{#each data.members as m (m.id)}<span class="person" style:--c={m.color}>{m.name}</span>{/each}
		</dd>
		<button type="button" class="link" onclick={() => go('members')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('modules')}</dt>
		<dd>
			{on.map((m) => m.name).join(', ') || t('setup.summary.onlyCalendar')}
			{#if off.length}<span class="muted">· {t('setup.summary.off', { list: off.map((m) => m.name).join(', ') })}</span>{/if}
		</dd>
		<button type="button" class="link" onclick={() => go('modules')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('theme')}</dt>
		<dd>{presetById(data.theme)?.name}</dd>
		<button type="button" class="link" onclick={() => go('theme')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('layout')}</dt>
		<dd>{presetName(data.layout)}</dd>
		<button type="button" class="link" onclick={() => go('layout')}>{t('setup.summary.change')}</button>
	</div>
	<div>
		<dt>{stepLabel('data')}</dt>
		<dd>{data.demo === 'example' ? t('setup.summary.withExample') : t('setup.summary.empty')}</dd>
		<button type="button" class="link" onclick={() => go('data')}>{t('setup.summary.change')}</button>
	</div>
</dl>
<div class="next">
	<h2>{t('setup.summary.nextTitle')}</h2>
	<p>
		{t('setup.summary.nextText')}
		<code data-testid="admin-url">{admin}</code>
	</p>
	<ul>
		<li>{t('setup.summary.google')}{data.google ? ` ${t('setup.summary.connected')}` : ''},</li>
		<li>{t('setup.summary.bring')}{data.bring ? ` ${t('setup.summary.connected')}` : ''},</li>
		<li>{t('setup.summary.rest')}</li>
	</ul>
</div>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 460px;
		gap: 32px;
		align-items: start;
	}
	.sum {
		margin: 0;
		display: grid;
		gap: 0;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.sum > div {
		display: grid;
		grid-template-columns: 180px 1fr auto;
		gap: 16px;
		align-items: center;
		padding: 8px 24px;
		min-height: 72px;
		border-top: 1px solid var(--line);
	}
	.sum > div:first-child {
		border-top: none;
	}
	dt {
		font-size: var(--s-small);
		font-weight: 600;
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-size: var(--s-body);
	}
	.people {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.person {
		border-left: 6px solid var(--c);
		background: var(--event-bg);
		padding: 2px 12px;
		border-radius: 6px;
	}
	.next {
		display: grid;
		gap: 10px;
		padding: 24px;
		border-radius: var(--radius);
		background: var(--event-bg);
		font-size: var(--s-body);
		line-height: 1.45;
	}
	.next h2 {
		margin: 0;
	}
	.next p,
	.next ul {
		margin: 0;
	}
	.next ul {
		padding-left: 1.2em;
		display: grid;
		gap: 4px;
	}
	code {
		font: 600 0.95em ui-monospace, 'SF Mono', Menlo, monospace;
		display: block;
		margin-top: 6px;
		background: var(--card);
		padding: 8px 12px;
		border-radius: 6px;
		-webkit-user-select: all;
		user-select: all;
		font-size: 0.9em;
		overflow-wrap: anywhere;
	}
	@media (max-width: 1300px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 700px) {
		.next {
			padding: 16px;
		}
		.sum > div {
			grid-template-columns: 1fr auto;
			padding: 12px 16px;
			gap: 4px 12px;
		}
		dt {
			grid-column: 1 / -1;
		}
	}
</style>
