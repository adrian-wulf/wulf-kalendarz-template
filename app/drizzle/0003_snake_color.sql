ALTER TABLE `snakes` ADD `color` text DEFAULT '#2f9e44' NOT NULL;--> statement-breakpoint
UPDATE `snakes` SET `color` = CASE `id`
	WHEN 'pixel' THEN '#c2255c'
	WHEN 'nugget' THEN '#5c940d'
	WHEN 'mango' THEN '#7048e8'
	WHEN 'kiwi' THEN '#0c8599'
	WHEN 'bajt' THEN '#1c7ed6'
	WHEN 'figa' THEN '#f08c00'
	ELSE `color` END;
