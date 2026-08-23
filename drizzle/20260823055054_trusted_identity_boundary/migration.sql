ALTER TABLE `media` ADD `romanized_title` text;--> statement-breakpoint
ALTER TABLE `media` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `external_subject` text;--> statement-breakpoint
DROP INDEX IF EXISTS `invites_token_uq`;--> statement-breakpoint
DROP INDEX IF EXISTS `sessions_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `sessions_expiry_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_subject_uq` ON `users` (`external_subject`);--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `country_code`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `runtime_minutes`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `episode_count`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `page_count`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `metadata_json`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_hash`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `active`;--> statement-breakpoint
ALTER TABLE `user_media` DROP COLUMN `time_spent_override_minutes`;