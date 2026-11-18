<script lang="ts">
	import type { AdminMember } from './admin.svelte.js';
	import { t } from '#lib/i18n/index.js';

	let { members, selected }: { members: AdminMember[]; selected: string | null } = $props();
</script>

<label
	>{t('admin.person')}
	<select name="memberId">
		<option value="" selected={!selected}>{t('add.wholeFamilyTile')}</option>
		{#each members as m (m.id)}<option value={m.id} selected={selected === m.id}>{m.name}</option>{/each}
	</select>
</label>

<style>
	label {
		display: grid;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	select {
		font: 16px var(--font-body);
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		min-width: 0;
	}
</style>
