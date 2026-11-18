ALTER TABLE `snakes` ADD `interval_max` integer;--> statement-breakpoint
UPDATE `snakes` SET `interval_days` = 21, `interval_max` = 28 WHERE `id` IN ('nugget', 'pixel', 'mango');
--> statement-breakpoint
UPDATE `snakes` SET `interval_days` = 7, `interval_max` = 10 WHERE `id` IN ('bajt', 'figa', 'kiwi');
