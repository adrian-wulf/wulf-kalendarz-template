import { act } from '#lib/server/act.js';
import { localParts } from '#lib/logic/dates.js';
import * as M from '#lib/server/meals.js';
import { defineServer } from '../server-types.js';

const localToday = () => localParts(new Date()).date;

export default defineServer('meals', {
	seed: (db) => M.seedMeals(db, localToday()),
	dashboard: ({ db, today }) => ({ data: M.mealsTile(db, today) }),
	admin: {
		load: (db, { today }) => ({ meals: { ...M.mealsData(db, today, 14), missing: M.missingFor(db, today) } }),
		actions: {
			saveRecipe: act((f, db) => M.saveRecipe(db, f), 'meals'),
			deleteRecipe: act((f, db) => M.deleteRecipe(db, f), 'meals'),
			saveMealPlan: act((f, db) => M.setMeal(db, f), 'mealPlan'),
			addMissingMeals: act((f, db) => M.addMissing(db, localToday(), f.getAll('name')), 'mealMissing')
		}
	}
});
