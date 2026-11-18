import { act } from '#lib/server/act.js';
import * as S from '#lib/server/snakes.js';
import { defineServer } from '../server-types.js';

export default defineServer('snakes', {
	seed: S.seedSnakes,
	dashboard: ({ db, today }) => ({ data: S.snakesSummary(db, today) }),
	admin: {
		load: (db, { today }) => ({ snakes: S.snakesData(db, today) }),
		actions: {
			saveSnake: act((f, db) => S.saveSnake(db, f), 'snakes'),
			deleteSnake: act((f, db) => S.deleteSnake(db, f), 'snakes'),
			addSnakeEvent: act((f, db) => S.addSnakeEventForm(db, f), 'snakes'),
			deleteSnakeEvent: act((f, db) => S.deleteSnakeEventForm(db, f), 'snakes'),
			saveFood: act((f, db) => S.saveFood(db, f), 'food'),
			deleteFood: act((f, db) => S.deleteFood(db, f), 'food')
		}
	}
});
