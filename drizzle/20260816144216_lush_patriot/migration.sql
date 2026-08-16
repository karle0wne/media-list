CREATE TABLE `service_state` (
	`id` text PRIMARY KEY,
	`last_backup_at` integer,
	`last_backup_key` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `media` ADD `metadata_refreshed_at` integer;--> statement-breakpoint
CREATE INDEX `import_batches_created_idx` ON `import_batches` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_metadata_refresh_idx` ON `media` (`external_source`,`metadata_refreshed_at`);