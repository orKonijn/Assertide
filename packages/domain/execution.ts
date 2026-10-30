export type RunPhase =
  | "queued"
  | "provisioning"
  | "running"
  | "finalizing"
  | "completed"
  | "canceled"
  | "infrastructure_error"
  | "timed_out";
export type ResultState =
  "passed" | "failed" | "broken" | "skipped" | "canceled" | "incomplete";
export interface ExecutionState {
  readonly phase: RunPhase;
  readonly version: number;
  readonly leaseEpoch: number;
  readonly cancelRequested: boolean;
}

const transitions: Readonly<Record<RunPhase, readonly RunPhase[]>> = {
  queued: ["provisioning", "canceled"],
  provisioning: ["running", "canceled", "infrastructure_error", "timed_out"],
  running: ["finalizing", "canceled", "infrastructure_error", "timed_out"],
  finalizing: ["completed", "canceled", "infrastructure_error", "timed_out"],
  completed: [],
  canceled: [],
  infrastructure_error: [],
  timed_out: [],
};

export function isTerminal(phase: RunPhase): boolean {
  return transitions[phase].length === 0;
}

/** Caller must persist with a database compare-and-swap on version and epoch. */
export function transitionRun(
  state: ExecutionState,
  next: RunPhase,
  version: number,
  epoch: number,
): ExecutionState {
  if (version !== state.version || epoch !== state.leaseEpoch)
    throw new Error("Stale execution owner or version");
  if (!transitions[state.phase].includes(next))
    throw new Error(`Invalid transition: ${state.phase} -> ${next}`);
  return { ...state, phase: next, version: state.version + 1 };
}

export function requestCancellation(state: ExecutionState): ExecutionState {
  if (isTerminal(state.phase) || state.cancelRequested) return state;
  return {
    ...state,
    phase: state.phase === "queued" ? "canceled" : state.phase,
    cancelRequested: true,
    version: state.version + 1,
  };
}

export interface FinalInstance {
  readonly state: ResultState;
  readonly expectedFailure: boolean;
  readonly quarantined?: boolean;
  readonly attempts: readonly ResultState[];
}
export interface HistoricalRun {
  readonly phase: RunPhase;
  readonly instances: readonly FinalInstance[];
}

/** Fractions are returned unrounded so callers never average rounded percentages. */
export function summarizeHistory(runs: readonly HistoricalRun[]) {
  const instances = runs
    .filter((run) => run.phase === "completed")
    .flatMap((run) => run.instances);
  const eligible = instances.filter(
    (item) =>
      !item.expectedFailure &&
      !item.quarantined &&
      ["passed", "failed", "broken"].includes(item.state),
  );
  const count = (predicate: (item: FinalInstance) => boolean) =>
    eligible.filter(predicate).length;
  const passed = count((item) => item.state === "passed");
  const failed = count((item) => item.state === "failed");
  const broken = count((item) => item.state === "broken");
  const firstAttemptPassed = count((item) => item.attempts[0] === "passed");
  const recovered = count(
    (item) =>
      item.state === "passed" &&
      item.attempts.slice(0, -1).some((attempt) => attempt === "failed"),
  );
  const rate = (numerator: number) =>
    eligible.length ? numerator / eligible.length : null;
  return {
    total: instances.length,
    executed: eligible.length,
    excluded: instances.length - eligible.length,
    passed,
    failed,
    broken,
    firstAttemptPassed,
    recovered,
    finalPassRate: rate(passed),
    firstAttemptPassRate: rate(firstAttemptPassed),
    recoveredFlakyRate: rate(recovered),
  };
}

export function nearestRankP95(samples: readonly number[]): number | null {
  if (samples.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Invalid duration sample");
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? null;
}
