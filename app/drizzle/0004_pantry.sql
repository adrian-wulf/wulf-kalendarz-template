CREATE TABLE `pantry_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`qty` integer NOT NULL,
	`added_at` text NOT NULL,
	`best_before` text,
	FOREIGN KEY (`product_id`) REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `pantry_places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pantry_places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '📦' NOT NULL,
	`freezer` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`category` text DEFAULT 'inne' NOT NULL,
	`unit` text DEFAULT 'szt.' NOT NULL,
	`min_qty` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`last_place_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_products_name_unique` ON `pantry_products` (`name`);--> statement-breakpoint
INSERT OR IGNORE INTO `pantry_places` (`id`, `name`, `icon`, `freezer`, `sort_order`) VALUES ('spizarnia', 'Spiżarnia', '🥫', 0, 0), ('zamrazarka', 'Zamrażarka', '❄️', 1, 1);
