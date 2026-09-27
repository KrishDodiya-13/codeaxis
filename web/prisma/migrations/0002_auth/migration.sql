-- Authentication, and project ownership.
--
-- `projects.user_id` is NOT NULL: an ownerless project is readable by anyone who knows
-- its id, which is exactly what this migration closes. The rows that exist now predate
-- users and cannot be assigned an owner, so they are removed rather than left
-- unreachable or, worse, left readable. Confirmed as throwaway development data before
-- writing this.

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "password_hash" TEXT,
    "email_verified" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key"
    ON "accounts"("provider", "provider_account_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "password_reset_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_otps_email_idx" ON "password_reset_otps"("email");

-- Remove the pre-auth projects. Their brand_states rows go with them by cascade.
DELETE FROM "projects";

-- AlterTable: ownership, now that nothing would violate it.
ALTER TABLE "projects" ADD COLUMN "user_id" TEXT NOT NULL;

CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
