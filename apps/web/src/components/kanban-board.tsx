import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Ticket, TicketStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const columns: Array<{ status: TicketStatus; label: string }> = [
  { status: "inbox", label: "Inbox" },
  { status: "needs_clarification", label: "Needs Clarification" },
  { status: "ready_for_planning", label: "Ready for Planning" },
  { status: "agent_ready", label: "Agent Ready" },
  { status: "running", label: "Running" },
  { status: "pr_open", label: "PR Open" },
  { status: "needs_human_review", label: "Needs Human Review" },
  { status: "done", label: "Done" },
  { status: "blocked", label: "Blocked" },
];

const columnStatusSet = new Set(columns.map((column) => column.status));

function readinessTone(score: number | null) {
  if (score === null) return "muted" as const;
  if (score >= 85) return "success" as const;
  if (score >= 60) return "warning" as const;
  return "danger" as const;
}

function TicketCardContent({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{ticket.ticketKey}</span>
        <Badge tone={readinessTone(ticket.readinessScore)}>{ticket.readinessScore ?? "—"}%</Badge>
      </div>
      <h4 className="text-[length:var(--text-sm)] font-medium leading-snug text-[var(--color-text-strong)]">
        {ticket.title}
      </h4>
      {ticket.readinessIssues.length > 0 ? (
        <p className="mt-1.5 text-[length:var(--text-xs)] text-[var(--color-warning)]">
          {ticket.readinessIssues.slice(0, 2).join(" · ")}
        </p>
      ) : null}
    </>
  );
}

function DraggableTicketCard({
  ticket,
  onSelect,
}: {
  ticket: Ticket;
  onSelect: (ticket: Ticket) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { type: "ticket", ticket },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <div className="flex gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] transition hover:bg-[var(--color-bg-selected)]">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="cursor-grab touch-none px-1.5 py-2.5 text-[var(--color-text-subtle)] active:cursor-grabbing"
          aria-label={`Drag ${ticket.ticketKey}`}
          {...listeners}
          {...attributes}
        >
          ⋮⋮
        </button>
        <div
          role="button"
          tabIndex={0}
          className="min-w-0 flex-1 cursor-pointer py-2.5 pr-2.5 text-left"
          onClick={() => onSelect(ticket)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(ticket);
            }
          }}
        >
          <TicketCardContent ticket={ticket} />
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  tickets,
  onSelectTicket,
}: {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
  });

  return (
    <section
      className={cn(
        "flex min-w-[240px] flex-1 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
      )}
    >
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">{label}</h3>
        <span className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{tickets.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 p-2 transition",
          isOver && "bg-[var(--color-bg-selected)]/40 ring-1 ring-inset ring-[var(--color-border)]",
        )}
      >
        {tickets.length === 0 ? (
          <p className="px-1 py-5 text-center text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            {isOver ? "Drop here" : "No tickets"}
          </p>
        ) : (
          tickets.map((ticket) => (
            <DraggableTicketCard key={ticket.id} ticket={ticket} onSelect={onSelectTicket} />
          ))
        )}
      </div>
    </section>
  );
}

function resolveDropStatus(overId: string | number, overData: unknown): TicketStatus | null {
  if (typeof overData === "object" && overData !== null && "type" in overData) {
    if (overData.type === "column" && "status" in overData && typeof overData.status === "string") {
      return overData.status as TicketStatus;
    }
    if (
      overData.type === "ticket" &&
      "ticket" in overData &&
      typeof overData.ticket === "object" &&
      overData.ticket !== null &&
      "status" in overData.ticket &&
      typeof overData.ticket.status === "string"
    ) {
      return overData.ticket.status as TicketStatus;
    }
  }

  if (typeof overId === "string" && columnStatusSet.has(overId as TicketStatus)) {
    return overId as TicketStatus;
  }

  return null;
}

type KanbanBoardProps = {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onMoveTicket: (ticket: Ticket, status: TicketStatus) => void;
};

export function KanbanBoard({ tickets, onSelectTicket, onMoveTicket }: KanbanBoardProps) {
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    const ticket = event.active.data.current?.ticket;
    if (ticket && typeof ticket === "object" && "id" in ticket) {
      setActiveTicket(ticket as Ticket);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);

    const { active, over } = event;
    if (!over) {
      return;
    }

    const ticket = active.data.current?.ticket;
    if (!ticket || typeof ticket !== "object" || !("id" in ticket) || !("status" in ticket)) {
      return;
    }

    const typedTicket = ticket as Ticket;
    const nextStatus = resolveDropStatus(over.id, over.data.current);
    if (!nextStatus || nextStatus === typedTicket.status) {
      return;
    }

    onMoveTicket(typedTicket, nextStatus);
  }

  function handleDragCancel() {
    setActiveTicket(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => {
          const columnTickets = tickets.filter((ticket) => ticket.status === column.status);
          return (
            <KanbanColumn
              key={column.status}
              status={column.status}
              label={column.label}
              tickets={columnTickets}
              onSelectTicket={onSelectTicket}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTicket ? (
          <div className="w-[240px] cursor-grabbing rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 shadow-lg">
            <TicketCardContent ticket={activeTicket} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
