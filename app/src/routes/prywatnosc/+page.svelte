<script lang="ts">
	import { t } from '#lib/i18n/index.js';
</script>

<svelte:head><title>{t('privacy.pageTitle')}</title></svelte:head>

<div class="scroll">
	<article>
		<h1>{t('privacy.title')}</h1>
		<p>{t('privacy.intro')}</p>
		<h2>{t('privacy.dataTitle')}</h2>
		<p>{t('privacy.data')}</p>
		<h2>{t('privacy.storageTitle')}</h2>
		<p>{t('privacy.storage')}</p>
		<h2>{t('privacy.revokeTitle')}</h2>
		<p>{t('privacy.revoke')} <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> {t('privacy.revokePanel')}</p>
		<p>{t('privacy.contact')}: rodzina@example.com</p>
	</article>
</div>

<style>
	.scroll {
		position: fixed;
		inset: 0;
		overflow: auto;
		user-select: text;
		cursor: auto;
	}
	article {
		max-width: 680px;
		margin: 0 auto;
		padding: 40px 16px;
		font-size: 17px;
		line-height: 1.6;
	}
	h1 {
		font-family: var(--font-head);
		font-size: 32px;
		line-height: 1.2;
	}
	h2 {
		font-family: var(--font-head);
		font-size: 22px;
		margin-top: 28px;
	}
	a {
		color: var(--fg);
	}
</style>
