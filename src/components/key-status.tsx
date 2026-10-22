export function KeyStatus({
  state,
  agent = false,
}: {
  state: "unknown" | "present" | "missing";
  agent?: boolean;
}) {
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
        className={
          agent
            ? "rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground"
            : "rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        }
        data-testid="key-status"
      >
        {agent
          ? "Server keys are present. They stay off this page. The AI agent will call Qloo."
          : "A Qloo key is present, but no OPENROUTER_API_KEY is set. The AI agent is off; Mediate runs the fixed Qloo pipeline instead."}
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
