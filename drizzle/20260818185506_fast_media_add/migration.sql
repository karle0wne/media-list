ALTER TABLE `media` ADD `metadata_status` text DEFAULT 'READY' NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `metadata_error` text;--> statement-breakpoint
CREATE INDEX `media_metadata_status_idx` ON `media` (`metadata_status`);