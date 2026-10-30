export const SuitesSelectors = {
  name: 'Name',
  description: 'Description',
  owner: 'Owner',
  tags: 'Tags (comma separated)',
  save: 'Save suite',
  run: 'Run suite',
  article: 'article',
  edit: (name: string) => `Edit ${name}`,
} as const;
