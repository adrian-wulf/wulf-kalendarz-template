CREATE TABLE `local_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`member_id` text,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`member_id` text,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_shopping` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`spec` text,
	`icon` text,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waste_done` (
	`key` text PRIMARY KEY NOT NULL,
	`done_at` text NOT NULL
);
