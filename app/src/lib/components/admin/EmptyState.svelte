<script lang="ts">
	/** --- 26b: guides --- pusty stan w panelu: co tu będzie i jedna jasna akcja. */
	let { title, text = '', href, action, testid }: { title: string; text?: string; href: string; action: string; testid?: string } = $props();
</script>

<div class="empty-state" data-testid={testid}>
	<p><b>{title}</b> {text}</p>
	<a class="button primary" {href}>{action}</a>
</div>

<style>
	.empty-state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px dashed var(--muted);
		background: var(--card);
	}
	.empty-state p {
		margin: 0;
		flex: 1 1 280px;
	}
	.button {
		font: 600 15px var(--font-body);
		padding: 9px 16px;
		border-radius: 8px;
		text-decoration: none;
		background: var(--fg);
		color: var(--card);
		white-space: nowrap;
	}
</style>
