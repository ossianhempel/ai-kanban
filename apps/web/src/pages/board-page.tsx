import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { evaluateReadiness } from "@ai-kanban/agent-protocol";
import { IconFolderOutline18, IconPlusOutline18 } from "nucleo-ui-essential-outline-18";
import { AppHeader } from "@/components/app-header";
import { KanbanBoard } from "@/components/kanban-board";
import { MotionCollapse, MotionOverlay, MotionSlidePanel } from "@/components/motion";
import { TicketDetailPanel } from "@/components/ticket-detail-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, type Repository, type Ticket, type TicketStatus } from "@/lib/api";
import { useProjectContext } from "@/lib/project-context";

export function BoardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projects,
    activeProjectSlug,
    activeProject,
    refreshProjects,
    setActiveProjectSlug,
  } = useProjectContext();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketRef, setSelectedTicketRef] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [{ tickets: nextTickets }, { repositories: nextRepos }] = await Promise.all([
        api.listTickets(activeProjectSlug ? { projectSlug: activeProjectSlug } : undefined),
        api.listRepositories(),
      ]);
      setTickets(nextTickets);
      setRepositories(nextRepos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [activeProjectSlug]);

  useEffect(() => {
    const ticketFromUrl = searchParams.get("ticket");
    if (ticketFromUrl) {
      setSelectedTicketRef(ticketFromUrl);
    }
  }, [searchParams]);

  function openTicket(ref: string) {
    setSelectedTicketRef(ref);
    const next = new URLSearchParams(searchParams);
    next.set("ticket", ref);
    setSearchParams(next, { replace: true });
  }

  function closeTicketPanel() {
    setSelectedTicketRef(null);
    const next = new URLSearchParams(searchParams);
    next.delete("ticket");
    setSearchParams(next, { replace: true });
  }

  async function ensureDefaultProject() {
    if (projects.length > 0) {
      return projects[0]!;
    }

    const { project } = await api.createProject({
      name: "Default Project",
      slug: "default",
      description: "Starter project for AI Kanban",
    });
    await refreshProjects();
    setActiveProjectSlug(project.slug);
    return project;
  }

  async function handleCreateTicket(intakeMode: "inbox" | "strict") {
    if (intakeMode === "strict" && !canSubmitStrictIntake) {
      return;
    }
    if (intakeMode === "inbox" && !title.trim()) {
      return;
    }

    const project = activeProject ?? (await ensureDefaultProject());
    setError(null);
    try {
      await api.createTicket({
        projectId: project.id,
        title: title.trim(),
        description: description.trim(),
        acceptanceCriteria: acceptanceCriteria.trim(),
        businessContext: businessContext.trim(),
        expectedOutcome: expectedOutcome.trim(),
        repositoryId: repositoryId || null,
        intakeMode,
      });
      setTitle("");
      setDescription("");
      setAcceptanceCriteria("");
      setBusinessContext("");
      setExpectedOutcome("");
      setRepositoryId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  }

  async function handleMoveTicket(ticket: Ticket, status: TicketStatus) {
    const previousStatus = ticket.status;
    setTickets((current) =>
      current.map((item) => (item.id === ticket.id ? { ...item, status } : item)),
    );
    setError(null);

    try {
      await api.updateTicketStatus(ticket.ticketKey, status);
    } catch (err) {
      setTickets((current) =>
        current.map((item) => (item.id === ticket.id ? { ...item, status: previousStatus } : item)),
      );
      setError(err instanceof Error ? err.message : "Failed to move ticket");
    }
  }

  const projectRepositories = repositories.filter(
    (repo) => activeProject && repo.projectId === activeProject.id,
  );

  const intakeReadiness = useMemo(
    () =>
      evaluateReadiness({
        title,
        description,
        acceptanceCriteria,
        businessContext,
        expectedOutcome,
        repositoryId: repositoryId || null,
      }),
    [title, description, acceptanceCriteria, businessContext, expectedOutcome, repositoryId],
  );

  const canSubmitStrictIntake = intakeReadiness.issues.length === 0;
  const canSubmitInbox = title.trim().length > 0;
  const clarificationCount = tickets.filter((ticket) => ticket.status === "needs_clarification").length;

  const intakeStarted =
    Boolean(title.trim()) ||
    Boolean(description.trim()) ||
    Boolean(acceptanceCriteria.trim()) ||
    Boolean(businessContext.trim()) ||
    Boolean(expectedOutcome.trim()) ||
    Boolean(repositoryId);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-5 px-5 py-6">
      <AppHeader
        eyebrow="AI-native control plane"
        title="AI Kanban"
        description="Prepare, validate, and orchestrate work for agents."
        actions={
          <>
            <Link to="/repositories">
              <Button variant="secondary" size="sm">
                <Icon icon={IconFolderOutline18} size={16} stroke="fine" />
                Repositories
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="secondary" size="sm">
                Agent settings
              </Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Intake</CardTitle>
          <CardDescription>
            Add a rough idea to Inbox, or fill every field to land directly in Agent Ready. Team-wide context lives in{" "}
            <Link to="/settings" className="text-[var(--color-text-strong)] underline-offset-2 hover:underline">
              Agent settings
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-2.5 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateTicket("strict");
            }}
          >
            {activeProject ? (
              <p className="md:col-span-2 text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
                Project: <span className="font-medium text-[var(--color-text-strong)]">{activeProject.name}</span>{" "}
                <span className="font-mono text-[length:var(--text-xs)]">({activeProject.slug})</span> — switch in the
                header.
              </p>
            ) : null}
            <Input
              className="md:col-span-2"
              placeholder="Title — what needs to happen?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Textarea
              className="md:col-span-2"
              placeholder="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Textarea
              placeholder="Acceptance criteria (one per line)"
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
            />
            <Textarea
              placeholder="Business context"
              value={businessContext}
              onChange={(event) => setBusinessContext(event.target.value)}
            />
            <Textarea
              className="md:col-span-2"
              placeholder="Expected outcome"
              value={expectedOutcome}
              onChange={(event) => setExpectedOutcome(event.target.value)}
            />
            <Select
              className="md:col-span-2"
              value={repositoryId}
              onChange={(event) => setRepositoryId(event.target.value)}
            >
              <option value="">
                {projectRepositories.length === 0
                  ? "Add a repository first (required for Agent Ready)"
                  : "Select repository (required for Agent Ready)"}
              </option>
              {projectRepositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </Select>
            {projectRepositories.length === 0 ? (
              <p className="md:col-span-2 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                Agent Ready intake requires a linked repository. Inbox accepts a title-only draft.{" "}
                <Link to="/repositories" className="text-[var(--color-text-strong)] underline-offset-2 hover:underline">
                  Add one on Repositories
                </Link>{" "}
                (sign in required).
              </p>
            ) : null}
            <div className="md:col-span-2 space-y-2">
              <MotionCollapse open={intakeStarted && !canSubmitStrictIntake}>
                <p className="pb-0.5 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                  For Agent Ready: {intakeReadiness.issues.join(" · ")}
                </p>
              </MotionCollapse>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canSubmitInbox}
                  onClick={() => void handleCreateTicket("inbox")}
                >
                  <Icon icon={IconPlusOutline18} size={16} stroke="fine" />
                  Add to Inbox
                </Button>
                <Button type="submit" size="sm" disabled={!canSubmitStrictIntake}>
                  <Icon icon={IconPlusOutline18} size={16} stroke="fine" />
                  Add to Agent Ready
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {clarificationCount > 0 ? (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-warning)]">
          {clarificationCount} ticket{clarificationCount === 1 ? "" : "s"}{" "}
          {clarificationCount === 1 ? "needs" : "need"} your input in{" "}
          <span className="font-medium text-[var(--color-text-strong)]">Needs Clarification</span> — open the
          ticket and reply in Comments.
        </p>
      ) : null}

      {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}
      {loading ? (
        <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading board…</p>
      ) : (
        <KanbanBoard
          tickets={tickets}
          onSelectTicket={(ticket) => openTicket(ticket.ticketKey)}
          onMoveTicket={(ticket, status) => void handleMoveTicket(ticket, status)}
        />
      )}

      <MotionOverlay
        open={Boolean(selectedTicketRef)}
        aria-label="Close ticket panel"
        onClose={closeTicketPanel}
      />
      <MotionSlidePanel open={Boolean(selectedTicketRef)}>
        {selectedTicketRef ? (
          <TicketDetailPanel
            ticketRef={selectedTicketRef}
            repositories={repositories}
            onClose={closeTicketPanel}
            onUpdated={() => void refresh()}
          />
        ) : null}
      </MotionSlidePanel>
    </div>
  );
}
