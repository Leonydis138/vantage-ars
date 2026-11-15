import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useOfficeSnapshot } from "@/components/office/office-snapshot-hook";
import { PageHeader } from "@/components/office/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile · Vantage-ARS" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const snapshot = useOfficeSnapshot();
  const router = useRouter();
  const { user } = useCurrentUserState();
  const session = authClient.useSession();
  // `draft` is null until the founder types, so the account's name shows through
  // even though the session resolves after the first render.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayName = user?.displayName ?? "Founder";
  const name = draft ?? user?.displayName ?? "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  async function saveName() {
    const next = name.trim();
    if (!next || saving) return;
    if (user?.isDevFallback) {
      toast.error("Editing a name needs a real signed-in account.");
      return;
    }
    setSaving(true);
    try {
      const result = await authClient.updateUser({ name: next });
      if (result?.error) {
        toast.error(result.error.message ?? "The name could not be saved.");
        return;
      }
      toast.success("Display name updated.");
      setDraft(next);
      await session.refetch?.();
      await router.invalidate();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The name could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="enter-up mx-auto max-w-3xl">
      <PageHeader
        kicker="Account"
        title="Who opens this desk."
        description="Your office identity. The office itself is single-founder: this account is the only one that sees records or resolves a gate."
      />

      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 font-serif text-xl text-accent">
            {initials || "V"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-2xl text-fg">{displayName}</p>
            <p className="truncate text-sm text-muted">{user?.primaryEmail ?? "No address on record"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="accent">founder</Badge>
              <Badge>single seat</Badge>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Role</dt>
            <dd className="mt-1 text-sm text-fg">{snapshot.company.authorRole}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Office</dt>
            <dd className="mt-1 text-sm text-fg">{snapshot.company.legalName}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Account id</dt>
            <dd className="mt-1 break-all font-mono text-[11px] text-muted">{user?.id ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Founder mail
            </dt>
            <dd className="mt-1 text-sm text-fg">
              {snapshot.mail.smtpConnected ? (snapshot.mail.account ?? "Connected") : "Not connected"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mb-4">
        <h2 className="font-serif text-xl">Display name</h2>
        <p className="mt-1 text-sm text-muted">
          Shown on the office shell and in the notices the desk files for you.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              className="mt-1"
              value={name}
              maxLength={80}
              onChange={(event) => setDraft(event.target.value)}
              disabled={user?.isDevFallback}
            />
          </div>
          <Button
            type="button"
            onClick={() => void saveName()}
            disabled={saving || !name.trim() || name.trim() === displayName || user?.isDevFallback}
          >
            {saving ? "Saving…" : "Save name"}
          </Button>
        </div>
        {user?.isDevFallback ? (
          <p className="mt-2 text-xs text-subtle">
            This preview is running without sign-in, so the name is read-only.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-serif text-xl">Contact and preferences</h2>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            Office notices go to{" "}
            <span className="text-fg">{snapshot.mail.account ?? "the configured founder address"}</span>.
            The address itself is set by the office deployment, not from this page.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/settings" className="font-medium text-accent underline-offset-4 hover:underline">
              Display and list preferences
            </Link>
            <Link to="/notifications" className="font-medium text-accent underline-offset-4 hover:underline">
              Notification history
            </Link>
            <Link to="/forgot-password" className="font-medium text-accent underline-offset-4 hover:underline">
              Reset the password
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
