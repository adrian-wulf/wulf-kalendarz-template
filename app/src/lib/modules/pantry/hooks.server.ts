import { act } from '#lib/server/act.js';
import { localParts } from '#lib/logic/dates.js';
import * as P from '#lib/server/pantry.js';
import { defineServer } from '../server-types.js';

export default defineServer('pantry', {
	// Miejsca z migracji – nazwy w języku z kreatora.
	seed: (db) => P.localizeDefaultPlaces(db),
	dashboard: ({ db, today }) => ({ data: P.pantrySummary(db, today) }),
	admin: {
		load: (db, { today }) => ({ pantry: P.pantryData(db, today) }),
		actions: {
			savePlace: act((f, db) => P.savePlace(db, f), 'pantry'),
			deletePlace: act((f, db) => P.deletePlace(db, f), 'pantry'),
			saveProduct: act((f, db) => P.saveProduct(db, f), 'pantry'),
			deleteProduct: act((f, db) => P.deleteProduct(db, f), 'pantry'),
			saveItem: act((f, db) => P.saveItem(db, f), 'pantry'),
			addPantryItem: act((f, db) => P.addPantry(db, Object.fromEntries(f), localParts(new Date()).date), 'pantry'),
			deleteItem: act((f, db) => P.deleteItem(db, f), 'pantry')
		}
	}
});
