-- DESTRUCTIVE: drops password/registration columns. Existing user rows will fail to migrate; recreate users via SSO.
ALTER TABLE `users` ADD `oidc_sub` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `groups` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_oidc_sub` ON `users` (`oidc_sub`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_hash`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `registration_ip`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `registration_user_agent`;