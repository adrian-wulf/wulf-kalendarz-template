import { listPhotos, MAX_PHOTOS, removeMedia, saveImage } from '#lib/server/media.js';
import { InputError } from '#lib/server/store.js';
import { act } from '#lib/server/act.js';
import { t } from '#lib/i18n/index.js';
import { moduleConfig } from '../index.js';
import { defineServer } from '../server-types.js';
import { screensaverSettings } from './index.js';

export default defineServer('screensaver', {
	dashboard: ({ modules }) => {
		const { idleMinutes, slideSeconds, clock } = moduleConfig(screensaverSettings, modules, 'screensaver');
		return { data: { photos: listPhotos().map((p) => p.url), idleMinutes, slideSeconds, clock } };
	},
	admin: {
		load: () => ({ photos: listPhotos(), maxPhotos: MAX_PHOTOS }),
		actions: {
			// Kilka zdjęć naraz (pole `photo` wielokrotne) – przeglądarka zmniejszyła je przed wysłaniem.
			uploadPhotos: act(async (f) => {
				const files = f.getAll('photo').filter((x) => x instanceof Blob && x.size > 0);
				if (!files.length) throw new InputError(t('p3a.media.err.noFile'));
				if (listPhotos().length + files.length > MAX_PHOTOS) throw new InputError(t('p3a.saver.err.tooMany', { max: MAX_PHOTOS }));
				for (const file of files) await saveImage('photos', file);
			}, 'screensaver'),
			deletePhoto: act((f) => removeMedia('photos', String(f.get('file') ?? '')), 'screensaver')
		}
	}
});
