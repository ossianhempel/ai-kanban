import type { Database } from "@ai-kanban/db";
import { jobs } from "@ai-kanban/db/schema";
import { eq, lte, and } from "drizzle-orm";

export type JobType =
  | "evaluate_readiness"
  | "generate_brief"
  | "scan_repository"
  | "enrich_ticket"
  | "send_notification";

export async function enqueueJob(
  db: Database,
  type: JobType,
  payload: Record<string, unknown>,
  scheduledFor = new Date(),
) {
  const [job] = await db
    .insert(jobs)
    .values({
      type,
      payload,
      scheduledFor,
    })
    .returning();

  return job;
}

export async function claimNextJob(db: Database) {
  const now = new Date();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.scheduledFor, now)))
    .limit(1);

  if (!job) {
    return null;
  }

  const [claimed] = await db
    .update(jobs)
    .set({
      status: "running",
      startedAt: now,
      attempts: job.attempts + 1,
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "pending")))
    .returning();

  return claimed ?? null;
}

export async function completeJob(db: Database, jobId: string) {
  await db
    .update(jobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(jobs.id, jobId));
}

export async function failJob(db: Database, jobId: string, error: string, maxAttempts: number) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return;
  }

  const shouldRetry = job.attempts < maxAttempts;

  await db
    .update(jobs)
    .set({
      status: shouldRetry ? "pending" : "failed",
      lastError: error,
      completedAt: shouldRetry ? null : new Date(),
    })
    .where(eq(jobs.id, jobId));
}
