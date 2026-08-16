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
CREATE TABLE `invites` (
	`id` text PRIMARY KEY,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_invites_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`country_code` text,
	`year` integer,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`external_sub_id` text DEFAULT '' NOT NULL,
	`runtime_minutes` integer,
	`episode_count` integer,
	`page_count` integer,
	`cover_url` text,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
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
	`time_spent_override_minutes` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_user_media_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_media_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_batches_user_idx` ON `import_batches` (`user_id`);--> statement-breakpoint
CREATE INDEX `import_rows_batch_idx` ON `import_rows` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_uq` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_external_identity_uq` ON `media` (`external_source`,`external_id`,`external_sub_id`);--> statement-breakpoint
CREATE INDEX `media_type_idx` ON `media` (`type`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_media_user_media_uq` ON `user_media` (`user_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `user_media_user_idx` ON `user_media` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_media_status_idx` ON `user_media` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);