import { missingKeyBannerCopy } from "@/lib/status-copy";

export function KeyStatus({ state }: { state: "unknown" | "present" | "missing" }) {
  if (state === "unknown") {
    return (
      <p
        className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        data-testid="key-status"
      >
        Checking whether a server key is set…
      </p>
    );
  }

  if (state === "present") {
    return (
      <p
        className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground"
        data-testid="key-status"
      >
        A server key is present. It stays off this page. Mediate will call Qloo.
      </p>
    );
  }

  const missing = missingKeyBannerCopy();
  return (
    <p
      className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      data-testid="key-status"
      role="status"
    >
      <span className="font-medium">{missing.title}. </span>
      {missing.body}
    </p>
  );
}
