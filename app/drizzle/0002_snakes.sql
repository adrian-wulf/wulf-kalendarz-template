CREATE TABLE `food_stock` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`min_count` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snake_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snake_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`food` text,
	`grams` integer,
	FOREIGN KEY (`snake_id`) REFERENCES `snakes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snakes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`sex` text NOT NULL,
	`born` text DEFAULT '' NOT NULL,
	`interval_days` integer,
	`pause_until` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
