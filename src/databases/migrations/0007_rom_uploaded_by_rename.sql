ALTER TABLE `roms` RENAME COLUMN "user_id" TO "uploaded_by";--> statement-breakpoint
DROP INDEX `idx_roms_user_status_platform`;--> statement-breakpoint
DROP INDEX `idx_roms_user_status_created`;--> statement-breakpoint
DROP INDEX `idx_roms_user_status_released`;--> statement-breakpoint
DROP INDEX `idx_roms_user_status_name`;--> statement-breakpoint
DROP INDEX `idx_roms_user_platform_filename`;--> statement-breakpoint
CREATE INDEX `idx_roms_status_platform` ON `roms` (`status`,`platform`);--> statement-breakpoint
CREATE INDEX `idx_roms_status_created` ON `roms` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_roms_status_released` ON `roms` (`status`,`game_release_date`);--> statement-breakpoint
CREATE INDEX `idx_roms_status_name` ON `roms` (`status`,`file_name`);--> statement-breakpoint
CREATE INDEX `idx_roms_platform_filename` ON `roms` (`platform`,`file_name`);--> statement-breakpoint
CREATE INDEX `idx_roms_uploadedby_status` ON `roms` (`uploaded_by`,`status`);