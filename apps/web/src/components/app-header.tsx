import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconArrowDoorOut3Outline18, IconUserOutline18 } from "nucleo-ui-essential-outline-18";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { signOut, useSession, type SessionUser } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { ProjectSwitcher } from "@/components/project-switcher";

type AppHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function AppHeader({ eyebrow, title, description, actions }: AppHeaderProps) {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  async function handleSignOut() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-subtle)]">{eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--text-2xl)] font-medium text-[var(--color-text-strong)]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ProjectSwitcher className="mr-1" />
        {actions}
        {isPending ? (
          <span className="px-2 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">…</span>
        ) : user ? (
          <>
            {(user as SessionUser).role === "admin" ? (
              <Badge tone="muted" className="hidden sm:inline-flex">
                Admin
              </Badge>
            ) : null}
            <span className="hidden max-w-[180px] truncate px-2 text-[length:var(--text-sm)] text-[var(--color-text-default)] sm:inline">
              {user.name || user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              <Icon icon={IconArrowDoorOut3Outline18} size={16} stroke="fine" />
              Sign out
            </Button>
          </>
        ) : (
          <Link to="/login">
            <Button variant="ghost" size="sm">
              <Icon icon={IconUserOutline18} size={16} stroke="fine" />
              Sign in
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
