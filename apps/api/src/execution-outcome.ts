/** Missing terminal evidence is an infrastructure failure, never a test verdict. */
export function executionPhase(code: number, canceled: boolean, missingResults: boolean): string {
  if (canceled) {
    return 'canceled';
  }
  if (code === -2) {
    return 'timed_out';
  }
  if ((code !== 0 && code !== 1) || missingResults) {
    return 'infrastructure_error';
  }
  return 'completed';
}
