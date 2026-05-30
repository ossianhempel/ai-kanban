export type ReadinessInput = {
  title: string;
  description: string;
  acceptanceCriteria: string;
  businessContext: string;
  expectedOutcome: string;
  repositoryId: string | null;
};

export type ReadinessResult = {
  score: number;
  issues: string[];
  recommendedStatus: "agent_ready" | "needs_clarification";
};

export class IntakeValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Intake incomplete: ${issues.join(", ")}`);
    this.name = "IntakeValidationError";
    this.issues = issues;
  }
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const issues: string[] = [];

  if (!input.title.trim()) {
    issues.push("Missing title");
  }

  if (!input.description.trim()) {
    issues.push("Missing description");
  }

  if (!input.acceptanceCriteria.trim()) {
    issues.push("Missing acceptance criteria");
  }

  if (!input.businessContext.trim()) {
    issues.push("Missing business context");
  }

  if (!input.expectedOutcome.trim()) {
    issues.push("Missing expected outcome");
  }

  if (!input.repositoryId) {
    issues.push("Missing affected repository");
  }

  const score = Math.max(0, 100 - issues.length * 15);

  return {
    score,
    issues,
    recommendedStatus: issues.length === 0 ? "agent_ready" : "needs_clarification",
  };
}

export function assertIntakeReady(input: ReadinessInput) {
  const readiness = evaluateReadiness(input);
  if (readiness.issues.length > 0) {
    throw new IntakeValidationError(readiness.issues);
  }
  return readiness;
}
