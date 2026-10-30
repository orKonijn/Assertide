export const ApiWorkspaceSelectors = {
  exchanges: '.exchange-item',
  page: (number: number) => `Exchange page ${number}`,
  heading: 'API workspace',
  run: 'Run API suite',
  execution: 'Execution',
  evidence: 'Recorded request and response',
  download: 'Download redacted JSON',
  pointer: 'JSON pointer',
  inspect: 'Inspect pointer',
  value: 'Selected JSON value',
  executable: (count: number) => `${count} executable API cases`,
} as const;
