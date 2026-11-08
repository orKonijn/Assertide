import { z } from 'zod';

const entry = z.object({
  id: z.string().regex(/^(LAB|UI)-\d+(?::(?:api|chromium|firefox|webkit))?$/),
  outcome: z.enum(['passed', 'failed', 'other']),
});

/** Bounded, chunk-safe counters from the approved worker reporter. */
export class ExecutionProgress {
  private buffer = '';
  private readonly outcomes = new Map<string, 'passed' | 'failed' | 'other'>();
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
          this.outcomes.set(parsed.data.id, parsed.data.outcome);
        }
      } catch {
        // Other worker output is not a progress event.
      }
    }
  }
  public snapshot(): { passed: number; failed: number; other: number } {
    const counts = { passed: 0, failed: 0, other: 0 };
    for (const outcome of this.outcomes.values()) {
      counts[outcome]++;
    }
    return counts;
  }
}
