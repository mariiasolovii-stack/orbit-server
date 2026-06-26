ALTER TABLE `posts` ADD `likes` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `posts` ADD `comments` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `posts` ADD `shares` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `posts` ADD `saves` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `posts` ADD `title` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `trackr_post_id` varchar(64);