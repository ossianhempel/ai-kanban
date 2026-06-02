import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { IconXmarkOutline18 } from "nucleo-ui-essential-outline-18";
import { MotionCollapse } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { Repository, TicketContext, TicketStatus, KnowledgeRef, TicketComment } from "@/lib/api";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

const statusLabels: Record<TicketStatus, string> = {
  inbox: "Inbox",
  needs_clarification: "Needs Clarification",
  ready_for_planning: "Ready for Planning",
  agent_ready: "Agent Ready",
  running: "Running",
  pr_open: "PR Open",
  needs_human_review: "Needs Human Review",
  done: "Done",
  blocked: "Blocked",
};

function readinessTone(score: number | null) {
  if (score === null) return "muted" as const;
  if (score >= 85) return "success" as const;
  if (score >= 60) return "warning" as const;
  return "danger" as const;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-subtle)]">{title}</h4>
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-[length:var(--text-sm)] text-[var(--color-text-default)]">
        {children}
      </div>
    </section>
  );
}

function BriefList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--color-text-subtle)]">None specified</p>;
  }

  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function commentKindTone(kind: TicketComment["kind"]) {
  if (kind === "clarification_request") return "warning" as const;
  if (kind === "agent_comment") return "muted" as const;
  return "default" as const;
}

function commentKindLabel(kind: TicketComment["kind"]) {
  if (kind === "clarification_request") return "Clarification";
  if (kind === "agent_comment") return "Agent";
  return "Comment";
}

function formatCommentTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

type TicketDetailPanelProps = {
  ticketRef: string | null;
  repositories: Repository[];
  onClose: () => void;
  onUpdated: () => void;
};

export function TicketDetailPanel({ ticketRef, repositories, onClose, onUpdated }: TicketDetailPanelProps) {
  const { data: session } = useSession();
  const isSignedIn = Boolean(session?.user);
  const [context, setContext] = useState<TicketContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAcceptanceCriteria, setDraftAcceptanceCriteria] = useState("");
  const [draftBusinessContext, setDraftBusinessContext] = useState("");
  const [draftExpectedOutcome, setDraftExpectedOutcome] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const [headBranch, setHeadBranch] = useState("");
  const [ticketRefs, setTicketRefs] = useState<KnowledgeRef[]>([]);
  const [refLabel, setRefLabel] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [commentBody, setCommentBody] = useState("");

  useEffect(() => {
    if (!ticketRef) {
      setContext(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await api.getTicket(ticketRef!);
        if (!cancelled) {
          setContext(next);
          setDraftTitle(next.ticket.title);
          setDraftDescription(next.ticket.description);
          setDraftAcceptanceCriteria(next.ticket.acceptanceCriteria);
          setDraftBusinessContext(next.ticket.businessContext);
          setDraftExpectedOutcome(next.ticket.expectedOutcome);
          setHeadBranch(next.ticket.branchName ?? "");
          setEditing(next.ticket.status === "needs_clarification");
          const { refs } = await api.listKnowledgeRefs({ scope: "ticket", ticketId: next.ticket.id });
          if (!cancelled) {
            setTicketRefs(refs);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ticket");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketRef]);

  if (!ticketRef) {
    return null;
  }

  async function reloadContext() {
    const next = await api.getTicket(ticketRef!);
    setContext(next);
    setDraftTitle(next.ticket.title);
    setDraftDescription(next.ticket.description);
    setDraftAcceptanceCriteria(next.ticket.acceptanceCriteria);
    setDraftBusinessContext(next.ticket.businessContext);
    setDraftExpectedOutcome(next.ticket.expectedOutcome);
    setHeadBranch(next.ticket.branchName ?? "");
    const { refs } = await api.listKnowledgeRefs({ scope: "ticket", ticketId: next.ticket.id });
    setTicketRefs(refs);
    onUpdated();
  }

  async function handleAddTicketRef(event: React.FormEvent) {
    event.preventDefault();
    if (!context || !refLabel.trim() || !refUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createKnowledgeRef({
        scope: "ticket",
        ticketId: context.ticket.id,
        label: refLabel.trim(),
        url: refUrl.trim(),
      });
      setRefLabel("");
      setRefUrl("");
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add doc link");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTicketRef(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteKnowledgeRef(id);
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove doc link");
    } finally {
      setSaving(false);
    }
  }

  async function handleClaimTicket() {
    if (!context) return;
    setSaving(true);
    setError(null);
    try {
      await api.claimTicket(context.ticketKey);
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start work on ticket");
    } finally {
      setSaving(false);
    }
  }

  async function handleRepositoryChange(repositoryId: string) {
    if (!context) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateTicket(context.ticketKey, {
        repositoryId: repositoryId || null,
      });
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update repository");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDetails() {
    if (!context) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateTicket(context.ticketKey, {
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        acceptanceCriteria: draftAcceptanceCriteria.trim(),
        businessContext: draftBusinessContext.trim(),
        expectedOutcome: draftExpectedOutcome.trim(),
      });
      await reloadContext();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ticket");
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkPullRequest() {
    if (!context || !pullRequestUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.linkPullRequest(context.ticketKey, {
        url: pullRequestUrl.trim(),
        branchName: headBranch.trim() || undefined,
      });
      setPullRequestUrl("");
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link pull request");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePullRequest() {
    if (!context || !headBranch.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createPullRequest(context.ticketKey, {
        headBranch: headBranch.trim(),
      });
      await reloadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pull request");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(event: React.FormEvent) {
    event.preventDefault();
    if (!context || !commentBody.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addTicketComment(context.ticketKey, { body: commentBody.trim() });
      setCommentBody("");
      await reloadContext();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setSaving(false);
    }
  }

  const canEditDetails =
    context?.ticket.status === "needs_clarification" ||
    context?.ticket.status === "inbox" ||
    context?.ticket.status === "agent_ready";

  const canManagePullRequest =
    context?.ticket.repositoryId &&
    (context.ticket.status === "running" || context.ticket.status === "agent_ready" || !context.ticket.pullRequestUrl);

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div>
          {context ? (
            <>
              <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{context.ticketKey}</p>
              <h2 className="mt-0.5 text-[length:var(--text-lg)] font-medium leading-snug text-[var(--color-text-strong)]">
                {context.ticket.title}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="muted">{statusLabels[context.ticket.status]}</Badge>
                <Badge tone={readinessTone(context.ticket.readinessScore ?? null)}>
                  {context.ticket.readinessScore ?? "—"}% ready
                </Badge>
              </div>
            </>
          ) : (
            <h2 className="text-[length:var(--text-lg)] font-medium text-[var(--color-text-strong)]">Ticket details</h2>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          <Icon icon={IconXmarkOutline18} size={16} stroke="fine" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading…</p> : null}
        {error ? <p className="mb-3 text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}

        {context ? (
          <div className="space-y-4">
            {context.ticket.readinessIssues.length > 0 ? (
              <Section title="Readiness issues">
                <ul className="space-y-0.5 text-[var(--color-warning)]">
                  {context.ticket.readinessIssues.map((issue) => (
                    <li key={issue}>• {issue}</li>
                  ))}
                </ul>
              </Section>
            ) : (
              <Section title="Readiness">
                <p className="text-[var(--color-success)]">Ticket meets readiness criteria.</p>
              </Section>
            )}

            {context.ticket.status === "agent_ready" ? (
              <div>
                <Button size="sm" disabled={saving} onClick={() => void handleClaimTicket()}>
                  {saving ? "Starting…" : "Start work (claim for agent)"}
                </Button>
                <p className="mt-1.5 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  Moves ticket to Running — same as an agent calling claim via MCP/CLI.
                </p>
              </div>
            ) : null}

            {canEditDetails ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  {editing ? "Edit fields to reach Agent Ready." : "Ticket details"}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => setEditing((current) => !current)}
                >
                  {editing ? "Cancel edit" : "Edit details"}
                </Button>
              </div>
            ) : null}

            <Section title="Repository">
              <Select
                value={context.ticket.repositoryId ?? ""}
                disabled={saving}
                onChange={(event) => void handleRepositoryChange(event.target.value)}
              >
                <option value="">No repository linked</option>
                {repositories
                  .filter((repo) => repo.projectId === context.project.id)
                  .map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.name}
                      {repo.readinessScore !== null ? ` (${repo.readinessScore}%)` : ""}
                    </option>
                  ))}
              </Select>
              {context.repository ? (
                <p className="mt-1.5 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  {context.repository.url ?? context.repository.localPath ?? "No path configured"}
                </p>
              ) : null}
            </Section>

            {context.ticket.pullRequestUrl ? (
              <Section title="Pull request">
                <p className="text-[length:var(--text-sm)]">
                  <a
                    href={context.ticket.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-text-strong)] underline-offset-2 hover:underline"
                  >
                    #{context.ticket.pullRequestNumber ?? "—"} · {context.ticket.pullRequestState ?? "linked"}
                  </a>
                </p>
                {context.ticket.branchName ? (
                  <p className="mt-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                    Branch: {context.ticket.branchName}
                  </p>
                ) : null}
              </Section>
            ) : canManagePullRequest ? (
              <Section title="Pull request">
                <div className="space-y-2">
                  <Input
                    placeholder="Branch name (for create or link)"
                    value={headBranch}
                    disabled={saving}
                    onChange={(event) => setHeadBranch(event.target.value)}
                  />
                  <Input
                    placeholder="Existing PR URL (optional)"
                    value={pullRequestUrl}
                    disabled={saving}
                    onChange={(event) => setPullRequestUrl(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving || !pullRequestUrl.trim()}
                      onClick={() => void handleLinkPullRequest()}
                    >
                      Link PR
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving || !headBranch.trim()}
                      onClick={() => void handleCreatePullRequest()}
                    >
                      Create PR
                    </Button>
                  </div>
                  <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                    Sign in and connect your provider on Repositories for PR actions to work.
                  </p>
                </div>
              </Section>
            ) : null}

            <Section title="Ticket doc links">
              {ticketRefs.length > 0 ? (
                <ul className="mb-3 space-y-1">
                  {ticketRefs.map((ref) => (
                    <li key={ref.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[var(--color-text-strong)]">{ref.label}</p>
                        <a href={ref.url} target="_blank" rel="noreferrer" className="text-[length:var(--text-xs)] underline-offset-2 hover:underline">
                          {ref.url}
                        </a>
                      </div>
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => void handleDeleteTicketRef(ref.id)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-[var(--color-text-subtle)]">No ticket-specific docs linked.</p>
              )}
              {isSignedIn ? (
                <form className="grid gap-2" onSubmit={handleAddTicketRef}>
                  <Input placeholder="Label" value={refLabel} onChange={(e) => setRefLabel(e.target.value)} />
                  <Input placeholder="Doc URL" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
                  <Button type="submit" size="sm" disabled={saving || !refLabel.trim() || !refUrl.trim()}>
                    Add doc link
                  </Button>
                </form>
              ) : (
                <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  Sign in to add ticket doc links.
                </p>
              )}
            </Section>

            <Section title="Comments">
              {(context.comments ?? []).length > 0 ? (
                <ul className="space-y-3">
                  {(context.comments ?? []).map((comment) => (
                    <li key={comment.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={commentKindTone(comment.kind)}>{commentKindLabel(comment.kind)}</Badge>
                        <span className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                          {formatCommentTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[var(--color-text-default)]">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--color-text-subtle)]">No comments yet.</p>
              )}
              {isSignedIn ? (
                <form className="mt-3 space-y-2" onSubmit={handleAddComment}>
                  <Textarea
                    placeholder="Reply to the agent or add context for the team…"
                    value={commentBody}
                    disabled={saving}
                    onChange={(event) => setCommentBody(event.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={saving || !commentBody.trim()}>
                    Add comment
                  </Button>
                </form>
              ) : (
                <p className="mt-3 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  Sign in to comment on this ticket.
                </p>
              )}
            </Section>

            <Section title="Description">
              {editing ? (
                <Textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
              ) : (
                context.ticket.description.trim() || <span className="text-[var(--color-text-subtle)]">Empty</span>
              )}
            </Section>

            <Section title="Acceptance criteria">
              {editing ? (
                <Textarea
                  value={draftAcceptanceCriteria}
                  onChange={(event) => setDraftAcceptanceCriteria(event.target.value)}
                />
              ) : context.ticket.acceptanceCriteria.trim() ? (
                <pre className="whitespace-pre-wrap font-sans">{context.ticket.acceptanceCriteria}</pre>
              ) : (
                <span className="text-[var(--color-text-subtle)]">Not specified</span>
              )}
            </Section>

            <Section title="Business context">
              {editing ? (
                <Textarea
                  value={draftBusinessContext}
                  onChange={(event) => setDraftBusinessContext(event.target.value)}
                />
              ) : (
                context.ticket.businessContext.trim() || (
                  <span className="text-[var(--color-text-subtle)]">Not specified</span>
                )
              )}
            </Section>

            <Section title="Expected outcome">
              {editing ? (
                <Textarea
                  value={draftExpectedOutcome}
                  onChange={(event) => setDraftExpectedOutcome(event.target.value)}
                />
              ) : (
                context.ticket.expectedOutcome.trim() || (
                  <span className="text-[var(--color-text-subtle)]">Not specified</span>
                )
              )}
            </Section>

            <MotionCollapse open={editing}>
              <div className="space-y-2 pt-0.5">
                <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Title" />
                <Button size="sm" disabled={saving || !draftTitle.trim()} onClick={() => void handleSaveDetails()}>
                  {saving ? "Saving…" : "Save and re-evaluate readiness"}
                </Button>
              </div>
            </MotionCollapse>

            <Section title="Agent brief">
              <p className="mb-2 font-medium text-[var(--color-text-strong)]">{context.brief.task}</p>
              <pre className="mb-3 whitespace-pre-wrap font-sans text-[var(--color-text-subtle)]">
                {context.brief.context}
              </pre>

              <div className="space-y-2.5">
                <div>
                  <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Acceptance criteria</p>
                  <BriefList items={context.brief.acceptanceCriteria} />
                </div>
                {context.brief.testCommands.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Test commands</p>
                    <BriefList items={context.brief.testCommands} />
                  </div>
                ) : null}
                {context.brief.relevantDocumentation.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Documentation</p>
                    <BriefList items={context.brief.relevantDocumentation} />
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Constraints</p>
                  <BriefList items={context.brief.constraints} />
                </div>
                <div>
                  <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Definition of done</p>
                  <BriefList items={context.brief.definitionOfDone} />
                </div>
                <div>
                  <p className="mb-1 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">Forbidden changes</p>
                  <BriefList items={context.brief.forbiddenChanges} />
                </div>
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
