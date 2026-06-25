CREATE TABLE `creators` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`status` enum('trial','active','fired') NOT NULL DEFAULT 'trial',
	`comp_type` enum('ppp','retainer') NOT NULL DEFAULT 'ppp',
	`base_rate` int DEFAULT 25,
	`retainer_amount` int DEFAULT 0,
	`platforms` text,
	`tiktok_handle` varchar(255),
	`instagram_handle` varchar(255),
	`start_date` timestamp,
	`docusign_status` enum('pending','sent','signed') DEFAULT 'pending',
	`docusign_envelope_id` varchar(255),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payout_tiers` (
	`id` varchar(36) NOT NULL,
	`views_threshold` int NOT NULL,
	`payout_amount` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payout_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` varchar(36) NOT NULL,
	`creator_id` varchar(36) NOT NULL,
	`post_id` varchar(36),
	`amount` int NOT NULL,
	`payout_type` enum('post','warmup','bonus','retainer') DEFAULT 'post',
	`payout_date` timestamp NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` varchar(36) NOT NULL,
	`creator_id` varchar(36) NOT NULL,
	`platform` varchar(50) NOT NULL,
	`post_date` timestamp NOT NULL,
	`post_url` varchar(500),
	`views` int DEFAULT 0,
	`review_status` enum('pending','approved','rejected') DEFAULT 'pending',
	`is_trial_post` int DEFAULT 0,
	`last_paid_tier` int DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`format` enum('talking_head','non_talking_head','skit','slideshow') NOT NULL,
	`content` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
