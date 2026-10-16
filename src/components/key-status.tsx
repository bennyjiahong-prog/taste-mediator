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

  return (
    <p
      className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      data-testid="key-status"
      role="status"
    >
      Qloo is not connected. This server has no QLOO_API_KEY. Mediate will not invent a movie
      list.
    </p>
  );
}
