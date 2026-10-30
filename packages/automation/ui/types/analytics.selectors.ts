export const AnalyticsSelectors = {
  heading: 'Quality at a glance',
  window: 'History window',
  browser: 'Execution project',
  apply: 'Apply filters',
  table: 'Show chart data and denominators',
  date: 'Date (UTC)',
  save: 'Save my filters',
  reset: 'Reset filters',
  restore: 'Restore my filters',
  comparison: 'Previous interval comparison',
  export: 'Export metrics JSON',
  period: (days: number) => `Last ${days} days`,
} as const;
export const HistorySelectors = {
  phase: 'Phase',
  browser: 'Browser or API',
  apply: 'Apply filters',
  created: 'Created',
  selected: 'Selected',
} as const;
