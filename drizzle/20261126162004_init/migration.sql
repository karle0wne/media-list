CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_import_batches_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` text PRIMARY KEY,
	`batch_id` text NOT NULL,
	`raw_input` text NOT NULL,
	`user_data_json` text,
	`candidates_json` text DEFAULT '[]' NOT NULL,
	`selected_candidate_key` text,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_import_rows_batch_id_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`romanized_title` text,
	`year` integer,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`external_sub_id` text DEFAULT '' NOT NULL,
	`external_url` text,
	`cover_url` text,
	`metadata_status` text DEFAULT 'READY' NOT NULL,
	`metadata_error` text,
	`metadata_refreshed_at` integer
);
--> statement-breakpoint
CREATE TABLE `service_state` (
	`id` text PRIMARY KEY,
	`last_backup_at` integer,
	`last_backup_key` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_media` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`score` integer,
	`progress_current` integer DEFAULT 0 NOT NULL,
	`progress_total` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_user_media_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_media_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL,
	`email` text,
	`external_subject` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_batches_user_idx` ON `import_batches` (`user_id`);--> statement-breakpoint
CREATE INDEX `import_batches_created_idx` ON `import_batches` (`created_at`);--> statement-breakpoint
CREATE INDEX `import_rows_batch_idx` ON `import_rows` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_external_identity_uq` ON `media` (`external_source`,`external_id`,`external_sub_id`);--> statement-breakpoint
CREATE INDEX `media_type_idx` ON `media` (`type`);--> statement-breakpoint
CREATE INDEX `media_metadata_refresh_idx` ON `media` (`external_source`,`metadata_refreshed_at`);--> statement-breakpoint
CREATE INDEX `media_metadata_status_idx` ON `media` (`metadata_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_media_user_media_uq` ON `user_media` (`user_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `user_media_user_idx` ON `user_media` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_media_status_idx` ON `user_media` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_subject_uq` ON `users` (`external_subject`);