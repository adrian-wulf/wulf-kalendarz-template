CREATE TABLE `care_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🪴' NOT NULL,
	`min_days` integer NOT NULL,
	`max_days` integer NOT NULL,
	`member_id` text,
	`pause_until` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `care_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`date` text NOT NULL,
	`done_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `care_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ha_entities` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `med_doses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`med_id` integer NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`taken_at` text NOT NULL,
	FOREIGN KEY (`med_id`) REFERENCES `meds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `med_doses_once` ON `med_doses` (`med_id`,`date`,`time`);--> statement-breakpoint
CREATE TABLE `meds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` text,
	`name` text NOT NULL,
	`dose` text DEFAULT '' NOT NULL,
	`times` text NOT NULL,
	`days` text DEFAULT '[]' NOT NULL,
	`start_date` text,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
