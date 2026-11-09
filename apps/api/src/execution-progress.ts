import { z } from 'zod';

const entry = z.object({
  id: z.string().regex(/^(LAB|UI)-\d+(?::(?:api|chromium|firefox|webkit))?$/),
  outcome: z.enum(['passed', 'failed', 'other', 'running', 'retrying']),
  title: z.string().max(300).optional(),
  startedAt: z.iso.datetime().optional(),
  retry: z.number().int().min(0).max(2).optional(),
});

/** Bounded, chunk-safe counters from the approved worker reporter. */
export class ExecutionProgress {
  private buffer = '';
  private readonly outcomes = new Map<string, 'passed' | 'failed' | 'other'>();
  private readonly active = new Map<
    string,
    { id: string; title: string; startedAt: string; retry: number }
  >();
  public accept(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = (lines.pop() ?? '').slice(-16384);
    for (const line of lines) {
      if (!line.startsWith('ASSERTIDE_PROGRESS ')) {
        continue;
      }
      try {
        const parsed = entry.safeParse(JSON.parse(line.slice('ASSERTIDE_PROGRESS '.length)));
        if (parsed.success && this.outcomes.size < 30000) {
          const data = parsed.data;
          if (data.outcome === 'running') {
            if (data.startedAt && this.active.size < 100) {
              this.active.set(data.id, {
                id: data.id,
                title: data.title ?? data.id,
                startedAt: data.startedAt,
                retry: data.retry ?? 0,
              });
            }
          } else {
            this.active.delete(data.id);
            if (data.outcome !== 'retrying') {
              this.outcomes.set(data.id, data.outcome);
            }
          }
        }
      } catch {
        // Other worker output is not a progress event.
      }
    }
  }
  public snapshot(): {
    passed: number;
    failed: number;
    other: number;
    active: { id: string; title: string; startedAt: string; retry: number }[];
    outcomes: { id: string; status: string }[];
  } {
    const counts = { passed: 0, failed: 0, other: 0 };
    for (const outcome of this.outcomes.values()) {
      counts[outcome]++;
    }
    return {
      ...counts,
      active: [...this.active.values()],
      outcomes: [...this.outcomes].map(([id, status]) => ({ id, status })),
    };
  }
}
