CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "DamageType" AS ENUM ('WATER', 'FIRE', 'MOLD', 'STORM', 'OTHER');

CREATE TYPE "JobStatus" AS ENUM ('NEW', 'INSPECTION', 'ESTIMATING', 'PROPOSAL_SENT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNumber" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "damageType" "DamageType" NOT NULL,
    "damageDescription" TEXT,
    "squareFeet" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobStatusChange" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

CREATE INDEX "Job_status_idx" ON "Job"("status");

CREATE INDEX "Job_damageType_idx" ON "Job"("damageType");

CREATE INDEX "JobStatusChange_jobId_idx" ON "JobStatusChange"("jobId");

ALTER TABLE "JobStatusChange" ADD CONSTRAINT "JobStatusChange_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

