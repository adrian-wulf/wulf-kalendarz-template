CREATE TABLE `chore_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chore_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`completed_at` text NOT NULL,
	`member_id` text,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`member_id` text,
	`recurrence` text NOT NULL,
	`start_date` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`avatar` text,
	`calendar_ids` text DEFAULT '[]' NOT NULL,
	`emails` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_cache` (
	`source` text PRIMARY KEY NOT NULL,
	`data` text,
	`fetched_at` text,
	`last_error` text,
	`last_error_at` text
);
