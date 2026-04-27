const { config } = require('dotenv');
const { Pool } = require('pg');
const { resolve } = require('path');

config({ path: resolve(__dirname, '../.env'), quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
DO $$
BEGIN
  CREATE TYPE "PremiumSubscriptionStatus" AS ENUM (
    'INCOMPLETE',
    'INCOMPLETE_EXPIRED',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'UNPAID',
    'PAUSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key"
  ON "User"("stripeCustomerId");

CREATE TABLE IF NOT EXISTS "PremiumSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "status" "PremiumSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "latestInvoiceId" TEXT,
  "latestPaymentStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PremiumSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PremiumSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PremiumSubscription_userId_key"
  ON "PremiumSubscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PremiumSubscription_stripeSubscriptionId_key"
  ON "PremiumSubscription"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "PremiumSubscription_status_currentPeriodEnd_idx"
  ON "PremiumSubscription"("status", "currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "PremiumSubscription_stripeCustomerId_idx"
  ON "PremiumSubscription"("stripeCustomerId");
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing in backend/.env');
  }

  await pool.query(sql);
  console.log('Billing schema synced');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
