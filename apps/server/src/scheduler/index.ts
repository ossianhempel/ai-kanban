import type { Database } from "@ai-kanban/db";
import { repositories } from "@ai-kanban/db/schema";
import { claimNextJob, completeJob, failJob } from "@ai-kanban/core";
import { scanRepository } from "@ai-kanban/integrations";
import { eq } from "drizzle-orm";
import cron from "node-cron";
import type { TicketService } from "../services/tickets";

export function startScheduler(db: Database, tickets: TicketService) {
  async function processJobs() {
    const job = await claimNextJob(db);
    if (!job) {
      return;
    }

    try {
      switch (job.type) {
        case "evaluate_readiness": {
          const ticketId = String(job.payload.ticketId ?? "");
          await tickets.refreshReadiness(ticketId);
          break;
        }
        case "generate_brief": {
          const ticketId = String(job.payload.ticketId ?? "");
          await tickets.refreshReadiness(ticketId);
          break;
        }
        case "scan_repository": {
          const repositoryId = String(job.payload.repositoryId ?? "");
          const [repository] = await db.select().from(repositories).where(eq(repositories.id, repositoryId)).limit(1);
          if (repository?.localPath) {
            const report = await scanRepository({
              localPath: repository.localPath,
              name: repository.name,
            });
            await db
              .update(repositories)
              .set({
                readinessScore: report.score,
                readinessReport: report,
              })
              .where(eq(repositories.id, repositoryId));
          }
          break;
        }
        case "enrich_ticket":
        case "send_notification":
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await completeJob(db, job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scheduler error";
      await failJob(db, job.id, message, job.maxAttempts);
    }
  }

  cron.schedule("* * * * *", () => {
    void processJobs();
  });

  const interval = setInterval(() => {
    void processJobs();
  }, 15_000);

  return () => {
    clearInterval(interval);
  };
}
