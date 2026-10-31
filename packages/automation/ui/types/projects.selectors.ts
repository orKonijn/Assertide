export const ProjectsSelectors = {
  name: 'Project name',
  search: 'Search projects',
  description: 'Description',
  create: 'Create project',
  save: 'Save project',
  section: 'section',
  edit: (name: string) => `Edit ${name}`,
} as const;
