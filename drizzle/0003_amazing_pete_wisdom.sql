ALTER TABLE `creators` ADD `archived` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `creators` ADD `archived_at` timestamp;--> statement-breakpoint
ALTER TABLE `creators` ADD `sync_enabled` int DEFAULT 1;