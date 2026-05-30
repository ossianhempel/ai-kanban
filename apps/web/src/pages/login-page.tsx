import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { IconArrowDoorInOutline18 } from "nucleo-ui-essential-outline-18";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { signIn, signUp, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = useSession();
  const initialMode: AuthMode = location.pathname === "/signup" ? "sign-up" : "sign-in";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  if (!isPending && session?.user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (isPending) {
    return (
      <p className="px-5 py-12 text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading…</p>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "sign-up") {
        const result = await signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
          return;
        }
      } else {
        const result = await signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
          return;
        }
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (message.includes("JSON") || message.includes("fetch")) {
        setError("Could not reach the server. Run `pnpm dev` and try again.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-5 py-12">
      <Link to="/" className="inline-flex">
        <Button variant="ghost" size="sm">
          <Icon icon={IconArrowDoorInOutline18} size={16} stroke="fine" />
          Back to board
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "sign-in" ? "Sign in" : "Create account"}</CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Sign in to create projects and manage repositories."
              : "Create an account to unlock project and repository management."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex rounded-md border border-[var(--color-border)] p-0.5">
            {(["sign-in", "sign-up"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  "flex-1 rounded px-2 py-1.5 text-[length:var(--text-sm)] transition",
                  mode === tab
                    ? "bg-[var(--color-bg-selected)] font-medium text-[var(--color-text-strong)]"
                    : "text-[var(--color-text-subtle)] hover:text-[var(--color-text-default)]",
                )}
                onClick={() => {
                  setMode(tab);
                  setError(null);
                }}
              >
                {tab === "sign-in" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            {mode === "sign-up" ? (
              <div className="space-y-1">
                <label className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]" htmlFor="name">
                  Name
                </label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
                value={password}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            Ticket intake on the board works without an account. Sign in is required to create projects and repositories.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
