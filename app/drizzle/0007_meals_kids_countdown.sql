CREATE TABLE `countdowns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '🎉' NOT NULL,
	`date` text NOT NULL,
	`yearly` integer DEFAULT false NOT NULL,
	`member_id` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `kid_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`task_id` integer,
	`period` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `kid_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kid_points_task_period` ON `kid_points` (`task_id`,`period`);--> statement-breakpoint
CREATE TABLE `kid_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` text NOT NULL,
	`reward_id` integer,
	`title` text NOT NULL,
	`emoji` text DEFAULT '🎁' NOT NULL,
	`cost` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `kid_rewards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `kid_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '🎁' NOT NULL,
	`cost` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kid_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text DEFAULT '⭐' NOT NULL,
	`points` integer DEFAULT 1 NOT NULL,
	`repeat` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`recipe_id` integer,
	`text` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_date_slot` ON `meal_plan` (`date`,`slot`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '🍽️' NOT NULL,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
