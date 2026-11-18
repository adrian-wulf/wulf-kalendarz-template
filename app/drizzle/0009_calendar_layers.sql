CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`color` text,
	`icon` text,
	`member_id` text,
	`show_kiosk` integer DEFAULT true NOT NULL,
	`show_phone` integer DEFAULT true NOT NULL,
	`sort_order` integer,
	`url` text,
	`refresh_minutes` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `local_events` ADD `calendar_id` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `local_events` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `local_events` ADD `location` text;--> statement-breakpoint
ALTER TABLE `local_events` ADD `description` text;